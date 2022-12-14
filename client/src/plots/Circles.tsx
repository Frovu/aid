import { useLayoutEffect, useMemo, useState } from 'react';
import { useSize } from '../util';
import { linePaths, circlePaths, color } from './plotUtil';
import { useQuery } from 'react-query';
import { Quadtree } from './quadtree';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';

import 'uplot/dist/uPlot.min.css';
import '../css/Circles.css';

type CirclesParams = {
	interval: [Date, Date],
	base?: Date,
	exclude?: string[],
	window?: number,
	minamp?: number 
};

type CirclesResponse = {
	base: number,
	time: number[],
	variation: (number | null)[][],
	shift: number[],
	station: string[],
	precursor_idx: [number[], number[]], // eslint-disable-line camelcase
	filtered: number,
	excluded: string[]
};

function circlesPlotOptions(initial: Partial<uPlot.Options>, interactive: boolean, data: any): Partial<uPlot.Options> {
	const font = window.getComputedStyle(document.body).font;
	let qt: Quadtree;
	let hoveredRect: { sidx: number, didx: number, w: number } | null = null;
	const legendValue = (u: uPlot) => {
		if (u.data == null || hoveredRect == null)
			return '';
		const d = u.data[hoveredRect.sidx] as any;
		const stIdx = d[3][hoveredRect.didx], lon = d[1][hoveredRect.didx].toFixed(2);
		const time = new Date(d[0][hoveredRect.didx] * 1000).toISOString().replace(/\..*|T/g, ' ');
		return `[ ${data.stations[stIdx]} ] v = ${d[2][hoveredRect.didx].toFixed(2)}%, aLon = ${lon}, time = ${time}`;
	};
	return {
		...initial,
		padding: [0, 0, 0, 0],
		mode: 2,
		legend: { show: interactive },
		cursor: !interactive ? undefined : {
			drag: { x: false, y: false, setScale: false },
			dataIdx: (u, seriesIdx) => {
				if (seriesIdx > 2) {
					return u.posToIdx(u.cursor.left! * devicePixelRatio);
				} if (seriesIdx === 1) {
					const cx = u.cursor.left! * devicePixelRatio;
					const cy = u.cursor.top! * devicePixelRatio;
					qt.hover(cx, cy, (o: any) => {
						hoveredRect = o;
					});
				}
				return hoveredRect && seriesIdx === hoveredRect.sidx ? hoveredRect.didx : 0;
			},
			points: {
				size: (u, seriesIdx) => {
					return hoveredRect && seriesIdx === hoveredRect.sidx ? hoveredRect.w / devicePixelRatio : 0;
				}
			}
		},
		hooks: {
			drawClear: [
				u => {
					// u.setSelect({
					// 	left: u.valToPos(base, 'x'),
					// 	top: 0,
					// 	width: u.valToPos(base + 86400, 'x') - u.valToPos(base, 'x'),
					// 	height: u.over.offsetHeight
					// });
					qt = new Quadtree(0, 0, u.bbox.width, u.bbox.height);
					qt.clear();
					u.series.forEach((s, i) => {
						if (i > 0) (s as any)._paths = null;
					});
				},
			],
		},
		axes: [
			{
				font,
				stroke: color('text'),
				grid: { stroke: color('grid'), width: 1 },
				ticks: { stroke: color('grid'), width: 1 },
				space: 70,
				size: 40,
				values: (u, vals) => vals.map(v => {
					const d = new Date(v * 1000);
					const day = String(d.getUTCDate()).padStart(2, '0');
					const hour =  String(d.getUTCHours()).padStart(2, '0');
					return day + '\'' + hour;
				})
			},
			{
				// label: 'asimptotic longitude, deg',
				scale: 'y',
				font,
				stroke: color('text'),
				values: (u, vals) => vals.map(v => v.toFixed(0)),
				ticks: { stroke: color('grid'), width: 1 },
				grid: { stroke: color('grid'), width: 1 }
			},
			{
				scale: 'idx',
				show: false
			}
		],
		scales: {
			x: {
				time: false,
				range: (u, min, max) => [min, max],
			},
			y: {
				range: [-5, 365],
			},
			idx: {
				range: [ -.04, 3.62 ]
			}
		},
		series: [
			{ facets: [ { scale: 'x', auto: true } ] },
			{
				label: '+',
				facets: [ { scale: 'x', auto: true }, { scale: 'y', auto: true } ],
				stroke: 'rgba(0,255,255,1)',
				fill: 'rgba(0,255,255,0.5)',
				value: legendValue,
				paths: circlePaths((rect: any) => qt.add(rect))
			},
			{
				label: '-',
				facets: [ { scale: 'x', auto: true }, { scale: 'y', auto: true } ],
				stroke: 'rgba(255,10,110,1)',
				fill: 'rgba(255,10,110,0.5)',
				value: legendValue,
				paths: circlePaths((rect: any) => qt.add(rect))
			},
			{
				scale: 'idx',
				label: 'idx',
				stroke: 'rgba(255,170,0,0.9)',
				facets: [ { scale: 'x', auto: true }, { scale: 'idx', auto: true } ],
				value: (u, v, si, di) => (u.data as any)[3][1][di] || 'NaN',
				paths: linePaths(1.75)
			}
		]
	};
}

async function queryCircles(params: CirclesParams) {
	const urlPara = new URLSearchParams({
		from: (params.interval[0].getTime() / 1000).toFixed(0),
		to:   (params.interval[1].getTime() / 1000).toFixed(0),
		...(params.exclude && { exclude: params.exclude.join() }),
		...(params.window && { window: params.window.toString() }),
		...(params.minamp && { minamp: params.minamp.toString() }),
	}).toString();
	const res = await fetch(process.env.REACT_APP_API + 'api/neutron/ros/?' + urlPara);
	if (res.status !== 200)
		throw new Error('HTTP '+res.status);
	const resp = await res.json() as CirclesResponse;
	
	const slen = resp.shift.length, tlen = resp.time.length;
	if (tlen < 10) return;
	const data = Array.from(Array(4), () => new Array(slen*tlen));
	let posCount = 0, nullCount = 0;
	for (let ti = 0; ti < tlen; ++ti) {
		for (let si = 0; si < slen; ++si) {
			const time = resp.time[ti], vv = resp.variation[ti][si];
			const idx = ti*slen + si;
			// if (vv < maxVar) maxVar = vv;
			if (vv == null) ++nullCount;
			else if (vv >= 0) ++posCount;
			data[0][idx] = time;
			data[1][idx] = (time / 86400 * 360 + resp.shift[si]) % 360;
			data[2][idx] = vv;
			data[3][idx] = si;
		}
	}
	// maxVar = Math.abs(maxVar);
	// if (maxVar < MAX_VAR) maxVar = MAX_VAR;
	const ndata = Array.from(Array(4), () => new Array(slen*tlen - posCount - nullCount));
	const pdata = Array.from(Array(4), () => new Array(posCount));
	let pi = 0, ni = 0;
	for (let idx = 0; idx < slen*tlen; ++idx) {
		const vv = data[2][idx];
		if (vv == null) continue;
		if (vv >= 0) {
			pdata[0][pi] = data[0][idx];
			pdata[1][pi] = data[1][idx];
			pdata[2][pi] = vv;
			pdata[3][pi] = data[3][idx];
			pi++;
		} else {
			ndata[0][ni] = data[0][idx];
			ndata[1][ni] = data[1][idx];
			ndata[2][ni] = vv;
			ndata[3][ni] = data[3][idx];
			ni++;
		}
	}
	const precIdx = resp.precursor_idx;
	console.log(resp, [ precIdx[0], pdata, ndata, precIdx ]);
	return {
		...resp,
		plotData: [ precIdx[0], pdata, ndata, precIdx ]
	};
}

export function PlotCircles({ params, interactive=false }: { params: CirclesParams, interactive?: boolean }) {
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);
	const query = useQuery('ros'+JSON.stringify(params), () => queryCircles(params));

	const [ uplot, setUplot ] = useState<uPlot>();
	const plotData = query.data?.plotData;

	useLayoutEffect(() => {
		if (uplot && plotData) uplot.setData(plotData as any);
	}, [uplot, plotData]);

	useLayoutEffect(() => {
		if (uplot) uplot.setSize(size);
	}, [uplot, size]);

	const plotComponent = useMemo(() => {
		if (!plotData || !container) return;
		const options = circlesPlotOptions({ ...size }, interactive, query.data) as uPlot.Options;
		console.log(options);
		return <UplotReact target={container} {...{ options, data: plotData as any, onCreate: setUplot }}/>;
	}, [interactive, plotData, container]); // eslint-disable-line react-hooks/exhaustive-deps

	if (query.isLoading)
		return <div>Loading...</div>;
	if (!query.data)
		return <div>Failed to obrain data</div>;
	return <div ref={node => setContainer(node)} style={{ position: 'absolute' }}>{plotComponent}</div>;
}

export default function PlotCirclesStandalone() {
	const params: CirclesParams = { interval: [ new Date('2021-12-06'), new Date('2021-12-12') ] };
	return <div style={{ position: 'relative', height: '100vh', width: '100vw' }}><PlotCircles {...{ params }}/></div>;
}