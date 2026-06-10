"""Offline tests for the response-parsing heuristics — no network/browser needed.

Run with:  python -m tests.test_parsers      (from the usc-bot/ directory)
"""
from usc_bot.client import (ClassState, _BOOKABLE_KEYS, _FREE_COUNT_KEYS,
                            _coerce_int, _deep_find)
from usc_bot.booker import (_ID_KEYS, _TITLE_KEYS, _iter_class_objects,
                            _parse_dt, _substitute_id)


def test_availability_open_detection():
    closed = {"data": {"class": {"id": 9981, "freeSpots": 0, "isBookable": False}}}
    st = ClassState(closed, _coerce_int(_deep_find(closed, _FREE_COUNT_KEYS)),
                    bool(_deep_find(closed, _BOOKABLE_KEYS)), None)
    assert st.is_open is False

    openc = {"data": {"class": {"id": 9981, "freeSpots": 1, "isBookable": True}}}
    st2 = ClassState(openc, _coerce_int(_deep_find(openc, _FREE_COUNT_KEYS)),
                     bool(_deep_find(openc, _BOOKABLE_KEYS)), None)
    assert st2.is_open is True


def test_class_object_discovery():
    mybookings = {"bookings": [
        {"id": 111, "name": "Yoga Flow", "start": "2026-06-11T18:30:00Z",
         "is_waitlisted": True, "url": "https://urbansportsclub.com/en/class/111"},
        {"id": 222, "title": "Bouldern", "starts_at": 1749665400, "waitlisted": False},
    ]}
    objs = list(_iter_class_objects(mybookings))
    assert len(objs) == 2


def test_id_substitution():
    assert _substitute_id("https://x/api/classes/12345/availability", "999") \
        == "https://x/api/classes/999/availability"
    # only path-like digit segments are replaced, not arbitrary body numbers
    assert _substitute_id('{"classId":"12345"}', "999") == '{"classId":"12345"}'
    assert _substitute_id("https://x/api/classes/{id}/book", "999") \
        == "https://x/api/classes/999/book"


def test_datetime_parsing():
    assert _parse_dt("2026-06-11T18:30:00Z") is not None
    assert _parse_dt(1749665400) is not None
    assert _parse_dt("11.06.2026 18:30") is not None
    assert _parse_dt(None) is None


def _run_all():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"PASS {fn.__name__}")
    print(f"\n{len(fns)} tests passed")


if __name__ == "__main__":
    _run_all()
