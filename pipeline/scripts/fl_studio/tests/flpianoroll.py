"""Strict fake of FL Studio's `flpianoroll` module for unit tests.

It proves script logic against the *documented* API, not real FL behaviour.
Sources the API surface and ranges are taken from:

* Image-Line manual, "Piano roll Scripting API" (pianoroll_scripting_api.htm)
  -- member list, value ranges and the factory tutorial scripts.
* IL-Group/FL-Studio-API-Stubs (piano_roll_scripting/flpianoroll) -- the
  Image-Line maintained type stubs (signatures, `hint=` keyword, selection).

Strictness (on while STRICT is True, which the tests always use):

* Unknown attributes/methods raise AttributeError (``__slots__`` everywhere).
* Read-only score members (PPQ, tsnum, tsden, noteCount, markerCount) cannot
  be assigned.
* Note properties are type- and range-checked: int properties reject floats
  and bools, 0..1 properties reject values outside 0..1, number is 0..131.
  Negative ``time`` is flagged too (FL may accept it, our scripts must not
  produce it).
* ``getNote`` returns a live handle (the manual's tutorials edit notes through
  it without writing back). A handle taken before ``deleteNote``/``clearNotes``
  raises on use: whether FL handles are index-based or object-based is
  undocumented, so scripts must not rely on either.
* ``deleteNote(i)`` shifts later indices down (the manual deletes "in
  descending order of index, so that the indices of the remaining notes do
  not change"). ``addNote`` appends without shifting.
* The score only exposes the selected notes when any note is selected,
  otherwise all notes (stub docstring of ``Score``).
* ScriptDialog methods check argument count/types, reject duplicate names
  and defaults outside min..max. ``GetInputValue`` returns float for knobs,
  int for int knobs, an int *index* for combos and a bool for checkboxes.

Test-only helpers are underscore-prefixed module functions; the scripts must
never use them (a test greps for ``flp._``).
"""
import math

STRICT = True

__all__ = ["score", "Note", "Marker", "ScriptDialog", "Utils"]


# --------------------------------------------------------------------------
# value validation
# --------------------------------------------------------------------------
def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and not (
        isinstance(v, float) and (math.isnan(v) or math.isinf(v)))


def _check(owner, name, kind, v, lo, hi):
    if kind == "int":
        if not _is_int(v):
            if STRICT:
                raise TypeError("%s.%s must be int, got %r" % (owner, name, v))
            v = int(v)
    elif kind == "float":
        if not _is_num(v):
            raise TypeError("%s.%s must be a number, got %r" % (owner, name, v))
        v = float(v)
    elif kind == "bool":
        if isinstance(v, bool) or (_is_int(v) and v in (0, 1)):
            v = bool(v)
        else:
            raise TypeError("%s.%s must be bool, got %r" % (owner, name, v))
    elif kind == "str":
        if not isinstance(v, str):
            raise TypeError("%s.%s must be str, got %r" % (owner, name, v))
    if STRICT and kind in ("int", "float"):
        if (lo is not None and v < lo) or (hi is not None and v > hi):
            raise ValueError("%s.%s=%r outside documented range %r..%r"
                             % (owner, name, v, lo, hi))
    return v


# name: (kind, lo, hi, default)    ranges from the manual's member table
NOTE_FIELDS = {
    "number": ("int", 0, 131, 0),        # tutorials keep 0 <= number < 132
    "time": ("int", 0, None, 0),
    "length": ("int", 0, None, 0),
    "group": ("int", 0, None, 0),
    "pan": ("float", 0.0, 1.0, 0.5),
    "velocity": ("float", 0.0, 1.0, 0.8),
    "release": ("float", 0.0, 1.0, 0.5),
    "color": ("int", 0, 15, 0),
    "fcut": ("float", 0.0, 1.0, 0.5),
    "fres": ("float", 0.0, 1.0, 0.5),
    "pitchofs": ("int", -120, 120, 0),
    "repeats": ("int", 0, 14, 0),
    "slide": ("bool", None, None, False),
    "porta": ("bool", None, None, False),
    "muted": ("bool", None, None, False),
    "selected": ("bool", None, None, False),
}

MARKER_FIELDS = {
    "time": ("int", 0, None, 0),
    "name": ("str", None, None, ""),
    "mode": ("int", None, None, 0),
    "tsnum": ("int", None, None, 4),
    "tsden": ("int", None, None, 4),
    "scale_root": ("int", 0, 11, 0),
    "scale_helper": ("str", None, None, "0,1,0,1,0,0,1,0,1,0,1,0"),
}


class StaleNoteError(RuntimeError):
    """A note handle was used after the score's indices changed."""


def _make_prop(owner, name, spec):
    kind, lo, hi, _ = spec

    def fget(self):
        self._live()
        return self._d[name]

    def fset(self, value):
        self._live()
        self._d[name] = _check(owner, name, kind, value, lo, hi)

    return property(fget, fset)


class _Item:
    __slots__ = ("_d", "_score", "_epoch")
    _FIELDS = {}

    def __init__(self):
        self._d = {k: s[3] for k, s in self._FIELDS.items()}
        self._score = None
        self._epoch = None

    def _live(self):
        sc = self._score
        if sc is not None and STRICT and self._epoch != sc._epoch:
            raise StaleNoteError("%s handle used after deleteNote/clear changed "
                                 "the score; call getNote again" % type(self).__name__)

    def clone(self):
        self._live()
        c = type(self)()
        c._d = dict(self._d)
        return c

    def __repr__(self):
        return "%s(%s)" % (type(self).__name__,
                           ", ".join("%s=%r" % kv for kv in sorted(self._d.items())))


class Note(_Item):
    """flp.Note() -- no constructor arguments (manual: `flp.Note()`)."""
    __slots__ = ()
    _FIELDS = NOTE_FIELDS


for _n, _s in NOTE_FIELDS.items():
    setattr(Note, _n, _make_prop("Note", _n, _s))


class Marker(_Item):
    __slots__ = ()
    _FIELDS = MARKER_FIELDS


for _n, _s in MARKER_FIELDS.items():
    setattr(Marker, _n, _make_prop("Marker", _n, _s))


def _index(i, count, what):
    if not _is_int(i):
        raise TypeError("%s index must be int, got %r" % (what, i))
    if not 0 <= i < count:  # no Python-style negative indexing in FL
        raise IndexError("%s index %r out of range 0..%d" % (what, i, count - 1))
    return i


class _Score:
    __slots__ = ("_ppq", "_tsnum", "_tsden", "_all", "_view", "_markers", "_epoch")

    def __init__(self):
        self._reset()

    def _reset(self, ppq=96, tsnum=4, tsden=4):
        self._ppq = ppq
        self._tsnum = tsnum
        self._tsden = tsden
        self._all = []      # every note dict on the piano roll
        self._view = None   # dicts visible to the script (selection or all)
        self._markers = []
        self._epoch = 0

    def _begin_run(self):
        """FL hands the script the selected notes, or all notes if none are."""
        sel = [d for d in self._all if d["selected"]]
        self._view = sel if sel else list(self._all)
        self._epoch += 1

    def _notes(self):
        if self._view is None:
            self._begin_run()
        return self._view

    # --- read-only members ------------------------------------------------
    @property
    def PPQ(self):
        return self._ppq

    @property
    def tsnum(self):
        if self._tsnum is None:  # simulate an FL build without tsnum
            raise AttributeError("tsnum")
        return self._tsnum

    @property
    def tsden(self):
        if self._tsden is None:
            raise AttributeError("tsden")
        return self._tsden

    @property
    def noteCount(self):
        return len(self._notes())

    @property
    def markerCount(self):
        return len(self._markers)

    # --- notes ---------------------------------------------------------------
    def getNote(self, index):
        view = self._notes()
        h = Note()
        h._d = view[_index(index, len(view), "note")]
        h._score = self
        h._epoch = self._epoch
        return h

    def addNote(self, note):
        if not isinstance(note, Note):
            raise TypeError("addNote expects flp.Note, got %r" % (note,))
        note._live()
        d = dict(note._d)  # FL stores a copy; later edits to `note` do not apply
        self._notes().append(d)
        self._all.append(d)

    def deleteNote(self, index):
        view = self._notes()
        d = view.pop(_index(index, len(view), "note"))
        self._all.remove(d)
        self._epoch += 1

    def clearNotes(self, all=False):
        view = self._notes()
        doomed = self._all if all else view
        ids = {id(d) for d in doomed}
        self._all = [d for d in self._all if id(d) not in ids]
        view[:] = [d for d in view if id(d) not in ids]
        self._epoch += 1

    def clear(self, all=False):
        self.clearNotes(all)
        self.clearMarkers(all)

    # --- markers -------------------------------------------------------------
    def addMarker(self, marker):
        if not isinstance(marker, Marker):
            raise TypeError("addMarker expects flp.Marker")
        self._markers.append(dict(marker._d))

    def getMarker(self, index):
        m = Marker()
        m._d = self._markers[_index(index, len(self._markers), "marker")]
        return m

    def deleteMarker(self, index):
        del self._markers[_index(index, len(self._markers), "marker")]

    def clearMarkers(self, all=False):
        self._markers = []

    # --- misc ----------------------------------------------------------------
    def getTimelineSelection(self):
        return -1, 0

    def getDefaultNoteProperties(self):
        return Note()

    def getNextFreeGroupIndex(self):
        return max([d["group"] for d in self._all] + [0]) + 1


score = _Score()


class _Utils:
    __slots__ = ("_log",)

    def __init__(self):
        self._log = []

    def log(self, msg):
        self._log.append(str(msg))

    def ShowMessage(self, msg):
        self._log.append(str(msg))

    def ProgressMsg(self, msg, pos, total):
        pass


Utils = _Utils()


# --------------------------------------------------------------------------
# ScriptDialog
# --------------------------------------------------------------------------
_overrides = {}


def _check_name(name, inputs):
    if not isinstance(name, str) or not name:
        raise TypeError("control name must be a non-empty str, got %r" % (name,))
    if name in inputs:
        raise ValueError("duplicate control name %r" % name)


def _check_hint(hint):
    if not isinstance(hint, str):
        raise TypeError("hint must be str")


class ScriptDialog:
    __slots__ = ("_title", "_description", "_inputs")

    def __init__(self, title, description):
        if not isinstance(title, str) or not isinstance(description, str):
            raise TypeError("ScriptDialog(title: str, description: str)")
        self._title = title
        self._description = description
        self._inputs = {}

    def AddInput(self, name, value, hint=""):
        _check_name(name, self._inputs)
        _check_hint(hint)
        value = _check("AddInput", name, "float", value, 0.0, 1.0)
        self._inputs[name] = dict(kind="knob", default=value, min=0.0, max=1.0)

    def AddInputKnob(self, name, value, min, max, hint=""):
        _check_name(name, self._inputs)
        _check_hint(hint)
        for v in (value, min, max):
            if not _is_num(v):
                raise TypeError("AddInputKnob(%r): numeric value/min/max required" % name)
        if not min < max or not min <= value <= max:
            raise ValueError("AddInputKnob(%r): need min < max and min <= value <= max" % name)
        self._inputs[name] = dict(kind="knob", default=float(value), min=min, max=max)

    def AddInputKnobInt(self, name, value, min, max, reserved=0, hint=""):
        _check_name(name, self._inputs)
        _check_hint(hint)
        for v in (value, min, max, reserved):
            if not _is_int(v):
                raise TypeError("AddInputKnobInt(%r): int value/min/max required, got %r"
                                % (name, v))
        if not min < max or not min <= value <= max:
            raise ValueError("AddInputKnobInt(%r): need min < max and min <= value <= max"
                             % name)
        self._inputs[name] = dict(kind="knobint", default=value, min=min, max=max)

    def AddInputCombo(self, name, values, value, hint=""):
        # Manual tutorials pass a list; the Edison stubs document a single
        # comma-separated string. Both forms are accepted.
        _check_name(name, self._inputs)
        _check_hint(hint)
        if isinstance(values, str):
            options = values.split(",")
        elif isinstance(values, (list, tuple)):
            options = list(values)
        else:
            raise TypeError("AddInputCombo(%r): values must be list or comma string" % name)
        if not options or not all(isinstance(o, str) and o for o in options):
            raise ValueError("AddInputCombo(%r): options must be non-empty strings" % name)
        if not isinstance(values, str) and any("," in o for o in options):
            raise ValueError("AddInputCombo(%r): option contains a comma" % name)
        if not _is_int(value) or not 0 <= value < len(options):
            raise ValueError("AddInputCombo(%r): default index %r out of range" % (name, value))
        self._inputs[name] = dict(kind="combo", default=value, options=options)

    def AddInputText(self, name, value, hint=""):
        _check_name(name, self._inputs)
        _check_hint(hint)
        if not isinstance(value, str):
            raise TypeError("AddInputText(%r): value must be str" % name)
        self._inputs[name] = dict(kind="text", default=value)

    def AddInputCheckbox(self, name, value, hint=""):
        _check_name(name, self._inputs)
        _check_hint(hint)
        value = _check("AddInputCheckbox", name, "bool", value, None, None)
        self._inputs[name] = dict(kind="checkbox", default=value)

    def AddInputSurface(self, name):
        _check_name(name, self._inputs)
        self._inputs[name] = dict(kind="surface", default=None)

    def _coerce(self, name, inp, v):
        kind = inp["kind"]
        if kind == "knob":
            if not _is_num(v) or not inp["min"] <= v <= inp["max"]:
                raise ValueError("value %r invalid for knob %r" % (v, name))
            return float(v)
        if kind == "knobint":
            if not _is_int(v) or not inp["min"] <= v <= inp["max"]:
                raise ValueError("value %r invalid for int knob %r" % (v, name))
            return v
        if kind == "combo":
            if not _is_int(v) or not 0 <= v < len(inp["options"]):
                raise ValueError("value %r invalid for combo %r" % (v, name))
            return v
        if kind == "checkbox":
            return _check("checkbox", name, "bool", v, None, None)
        return v

    def GetInputValue(self, name):
        if name not in self._inputs:
            raise KeyError("Unknown dialog input: %r" % (name,))
        inp = self._inputs[name]
        if name in _overrides:
            return self._coerce(name, inp, _overrides[name])
        return inp["default"]

    def Execute(self):
        return True

    # The current manual spells the methods in lowerCamelCase.
    addInput = AddInput
    addInputKnob = AddInputKnob
    addInputKnobInt = AddInputKnobInt
    addInputCombo = AddInputCombo
    addInputText = AddInputText
    addInputCheckbox = AddInputCheckbox
    addInputSurface = AddInputSurface
    getInputValue = GetInputValue
    execute = Execute


# --------------------------------------------------------------------------
# test-only helpers
# --------------------------------------------------------------------------
def _reset(ppq=96, tsnum=4, tsden=4):
    _overrides.clear()
    score._reset(ppq, tsnum, tsden)


def _make_note(**fields):
    n = Note()
    for k, v in fields.items():
        if k not in NOTE_FIELDS:
            raise AttributeError(k)
        setattr(n, k, v)
    return n


def _add(note):
    """Put a note on the piano roll (outside a script run)."""
    score._all.append(dict(note._d))
    score._view = None


def _all_notes():
    """Detached copies of every note on the piano roll, in storage order."""
    out = []
    for d in score._all:
        n = Note()
        n._d = dict(d)
        out.append(n)
    return out


def _set_inputs(values):
    _overrides.clear()
    _overrides.update(values)


def _inputs(form):
    return form._inputs


def _title(form):
    return form._title
