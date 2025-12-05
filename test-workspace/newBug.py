def divide(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None