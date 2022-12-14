from flask import Blueprint, request

from data_series.omni import database
from routers.utils import route_shielded

bp = Blueprint('omni', __name__, url_prefix='/api/omni')

@bp.route('/', methods=['GET'])
@route_shielded
def get_result():
	t_from = int(request.args.get('from'))
	t_to = int(request.args.get('to'))
	fields = request.args.get('fields')
	res, fields = database.fetch([t_from, t_to], fields.split(',') if fields else None)
	return { "data": res, "fields": fields }