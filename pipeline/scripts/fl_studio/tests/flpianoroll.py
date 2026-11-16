"""Minimal fake of FL Studio's `flpianoroll` module for unit tests.

It models only what the scripts in this folder use. It proves script logic,
not real FL Studio behaviour.
"""


class Note:
    def __init__(self, number=60, time=0, length=24, velocity=0.8, pan=0.5, fcut=0.5,
                 fres=0.5, color=0, group=0, slide=False, porta=False, muted=False,
                 selected=False, repeats=0):
        self.number = number
        self.time = time
        self.length = length
        self.velocity = velocity
        self.pan = pan
        self.fcut = fcut
        self.fres = fres
        self.color = color
        self.group = group
        self.slide = slide
        self.porta = porta
        self.muted = muted
        self.selected = selected
        self.repeats = repeats

    def __repr__(self):
        return "Note(n=%r, t=%r, len=%r, v=%.3f)" % (self.number, self.time, self.length, self.velocity)


class _Score:
    def __init__(self):
        self.reset()

    def reset(self, ppq=96, tsnum=4, tsden=4):
        self.PPQ = ppq
        self.tsnum = tsnum
        self.tsden = tsden
        self.notes = []

    @property
    def noteCount(self):
        return len(self.notes)

    def getNote(self, index):
        return self.notes[index]  # live reference, like FL

    def addNote(self, note):
        self.notes.append(note)

    def deleteNote(self, index):
        del self.notes[index]

    def clearNotes(self, all=False):
        self.notes = []


score = _Score()


class ScriptDialog:
    """Records inputs; GetInputValue returns an override or the default."""

    overrides = {}  # set by tests: {input name: value}

    def __init__(self, title, description=""):
        self.title = title
        self.description = description
        self.inputs = {}

    def _add(self, name, kind, default, **extra):
        self.inputs[name] = dict(kind=kind, default=default, **extra)

    def AddInputKnob(self, name, value, vmin, vmax):
        self._add(name, "knob", value, min=vmin, max=vmax)

    def AddInputKnobInt(self, name, value, vmin, vmax):
        self._add(name, "knobint", int(value), min=vmin, max=vmax)

    def AddInputCheckbox(self, name, value):
        self._add(name, "checkbox", bool(value))

    def AddInputCombo(self, name, value_list, value):
        options = value_list.split(",") if isinstance(value_list, str) else list(value_list)
        self._add(name, "combo", int(value), options=options)

    def GetInputValue(self, name):
        if name not in self.inputs:
            raise KeyError("Unknown dialog input: %r" % name)
        if name in ScriptDialog.overrides:
            return ScriptDialog.overrides[name]
        return self.inputs[name]["default"]
