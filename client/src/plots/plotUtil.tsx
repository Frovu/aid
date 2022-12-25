import { useState } from 'react';
import { useQuery } from 'react-query';
import { useSize } from '../util';
import uPlot from 'uplot';

import { MagneticCloud, Onset } from '../table/Table';
import UplotReact from 'uplot-react';

export type BasicPlotParams = {
	interval: [Date, Date],
	onsets?: Onset[],
	clouds?: MagneticCloud[],
	interactive?: boolean
};

export function drawOnsets(u: uPlot, onsets: Onset[]) {
	for (const onset of onsets) {
		const OnsetX = u.valToPos(onset.time.getTime() / 1e3, 'x');
		const useColor = onset.secondary ? color('text', .6) : color('white');
		u.ctx.save();
		u.ctx.fillStyle = u.ctx.strokeStyle = useColor;
		u.ctx.font = font(14).replace('400', '600');
		u.ctx.lineWidth = 2;
		u.ctx.beginPath();
		u.ctx.moveTo(u.bbox.left + OnsetX, u.bbox.top);
		u.ctx.lineTo(u.bbox.left + OnsetX, u.bbox.top + u.bbox.height);
		u.ctx.stroke();
		u.ctx.fillText(onset.type || 'ons',
			u.bbox.left + OnsetX + 4, u.bbox.top + u.bbox.height + 8);
		u.ctx.restore();
	}
}

export function drawMagneticClouds(u: uPlot, clouds: MagneticCloud[]) {
	for (const cloud of clouds) {
		const startX = u.valToPos(cloud.start.getTime() / 1e3, 'x', true);
		const endX = u.valToPos(cloud.end.getTime() / 1e3, 'x', true);
		u.ctx.save();
		u.ctx.fillStyle = u.ctx.strokeStyle = color('skyblue', .1);
		u.ctx.fillRect(startX, u.over.offsetTop, endX - startX, u.over.offsetHeight);
		u.ctx.restore();
	}
}

export function customTimeSplits(): Partial<uPlot.Axis> {
	return {
		splits: (u, ax, min, max, incr, space) => {
			const num = Math.floor(u.width / 76);
			const width = Math.ceil((max - min) / num);
			const split = ([ 4, 6, 12, 24 ].find(s => width <= s * 3600) || 48) * 3600;
			const start = Math.ceil(min / split) * split;
			const limit = Math.ceil((max - split/4 - start) / split);
			return Array(limit).fill(1).map((a, i) => start + i * split);
		},
		values: (u, splits) => splits.map((v, i) => {
			if (v % 86400 !== 0)
				return null;
			const d = new Date(v * 1e3);
			const month = String(d.getUTCMonth() + 1).padStart(2, '0');
			const day = String(d.getUTCDate()).padStart(2, '0');
			const showYear = (v - splits[0] < 86400) && String(d.getUTCFullYear());
			return (showYear ? showYear + '-' : '     ') + month + '-' + day;
		})
	};
}

export function axisDefaults(): Partial<uPlot.Axis> {
	return {
		font: font(14),
		stroke: color('text'),
		grid: { stroke: color('grid'), width: 1 },
		ticks: { stroke: color('grid'), width: 1 },
	};
}

export function color(name: string, opacity=1) {
	const col = window.getComputedStyle(document.body).getPropertyValue('--color-'+name) || 'red';
	return col.includes('rgb') ? `rgba(${col.match(/[\d.]+/g)!.slice(0,3).join(',')},${opacity})` : col;
}

export function font(size=16) {
	const fnt = window.getComputedStyle(document.body).font;
	return fnt.replace(/\d+px/, size+'px');
}

export async function basicDataQuery(path: string, interval: [Date, Date], fields: string[]) {
	const urlPara = new URLSearchParams({
		from: (interval[0].getTime() / 1000).toFixed(0),
		to:   (interval[1].getTime() / 1000).toFixed(0),
	}).toString();
	const res = await fetch(process.env.REACT_APP_API + path + '?' + urlPara);
	if (res.status !== 200)
		throw Error('HTTP '+res.status);
	const body = await res.json() as { data: any[][], fields: string[] };
	if (!body?.data.length) return null;
	const fieldsIdxs = fields.map(f => body.fields.indexOf(f));
	return fieldsIdxs.map(i => body.data.map(row => row[i]));
}

export function BasicPlot({ queryKey, queryFn, optionsFn }:
{ queryKey: any[], queryFn: () => Promise<any[][] | null>, optionsFn: (size: { width: number, height: number }) => uPlot.Options}) {
	const query = useQuery(queryKey, queryFn);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	if (query.isLoading)
		return <div className='Center'>LOADING...</div>;
	if (query.isError)
		return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;
	if (!query.data)
		return <div className='Center'>NO DATA</div>;

	return (<div ref={node => setContainer(node)} style={{ position: 'absolute' }}>
		<UplotReact {...{ options: optionsFn(size), data: query.data as any }}/>
	</div>);

}