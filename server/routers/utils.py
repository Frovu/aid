import logging, traceback
log = logging.getLogger('aides')

def route_shielded(func):
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except ValueError as e:
            if str(e): log.error(f'Error in {func.__name__}: {traceback.format_exc()}')
            return {}, 400
        except Exception:
            log.error(f'Error in {func.__name__}: {traceback.format_exc()}')
            return {}, 500
    wrapper.__name__ = func.__name__
    return wrapper