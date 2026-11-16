"""Seeded property/fuzz tests for the FL Studio piano-roll scripts (stdlib only).

Every case builds a random piano roll (PPQ, time signature, chords,
overlaps, zero-length notes, velocity/pan/fcut extremes, optional selection)
and random dialog values, runs a script against the strict `flpianoroll`
shim and checks invariants. The shim itself raises on any out-of-range or
wrongly-typed note write, unknown attribute, or stale note handle.

Each note carries a unique `group` number as an identity tag (no script
reads or writes `group`).
"""
import itertools
import os
import random
import re
import unittest

from .test_fl_scripts import CLEANER, FPC, GROOVE, SCRIPTS_DIR, flp, notes

PPQS = (24, 48, 96, 192, 384, 960)
TIME_SIGS = ((3, 4), (4, 4), (6, 8), (7, 8))
GM_DRUMS = list(range(35, 60))


def random_score(rng):
    ppq = rng.choice(PPQS)
    tsnum, tsden = rng.choice(TIME_SIGS)
    flp._reset(ppq=ppq, tsnum=tsnum, tsden=tsden)
    if rng.random() < 0.1:  # an FL build that does not expose tsnum/tsden
        flp.score._reset(ppq, None, None)
    bar = ppq * 4 * tsnum // tsden
    specs = []

    def pitch():
        r = rng.random()
        if r < 0.4:
            return rng.choice(GM_DRUMS)
        if r < 0.5:
            return rng.choice((0, 1, 127, 130, 131))
        return rng.randint(20, 100)

    def velocity():
        r = rng.random()
        if r < 0.15:
            return rng.choice((0.0, 1.0, 0.01, 0.99))
        return round(rng.random(), 4)

    def length():
        r = rng.random()
        if r < 0.1:
            return 0
        if r < 0.25:
            return rng.randint(1, max(1, ppq // 16))
        return rng.randint(1, ppq * 2)

    for _ in range(rng.randint(0, 40)):
        kind = rng.random()
        t = rng.randint(0, bar * 4)
        if kind < 0.2:  # chord: 2..6 notes within the PPQ/48 window
            spread = max(0, ppq // 48)
            for _ in range(rng.randint(2, 6)):
                specs.append((pitch(), t + rng.randint(0, spread), length(), velocity()))
        elif kind < 0.3:  # overlapping duplicates / unisons
            p = pitch()
            for _ in range(rng.randint(2, 3)):
                specs.append((p, t + rng.randint(0, ppq // 4), length(), velocity()))
        else:
            specs.append((pitch(), t, length(), velocity()))
    if rng.random() < 0.2:
        specs.append((rng.choice(GM_DRUMS), 0, length(), velocity()))  # time 0 edge

    select = rng.random() < 0.2
    for uid, (p, t, l, v) in enumerate(specs, start=1):
        n = flp._make_note(number=p, time=t, length=l, velocity=v, group=uid)
        n.pan = rng.choice((0.0, 0.5, 1.0, round(rng.random(), 3)))
        n.fcut = rng.choice((0.0, 0.5, 1.0, round(rng.random(), 3)))
        n.selected = select and rng.random() < 0.5
        flp._add(n)
    return ppq, tsnum, tsden


def random_inputs(rng, module, discrete):
    """Random knob values (endpoints favoured) + the given combo/checkbox values."""
    form = module.createDialog()
    values = {}
    for name, inp in flp._inputs(form).items():
        if name in discrete:
            values[name] = discrete[name]
        elif inp["kind"] == "knobint":
            values[name] = rng.choice((inp["min"], inp["max"], rng.randint(inp["min"], inp["max"])))
        elif inp["kind"] == "knob":
            values[name] = rng.choice((inp["min"], inp["max"], rng.uniform(inp["min"], inp["max"])))
    return values


def discrete_combos(module):
    """Every combination of combo index and checkbox value (bool and 0/1 int)."""
    form = module.createDialog()
    names, choices = [], []
    for name, inp in flp._inputs(form).items():
        if inp["kind"] == "combo":
            names.append(name)
            choices.append(range(len(inp["options"])))
        elif inp["kind"] == "checkbox":
            names.append(name)
            choices.append((True, False, 1, 0))
    return [dict(zip(names, c)) for c in itertools.product(*choices)]


def by_uid(note_list):
    return {n.group: n for n in note_list}


def run_with(module, values, seed):
    flp._set_inputs(values)
    form = module.createDialog()
    flp.score._begin_run()
    view_uids = [flp.score.getNote(i).group for i in range(flp.score.noteCount)]
    random.seed(seed)
    module.apply(form)
    return view_uids


def gated(n, min_len, min_vel):
    return n.length < min_len or n.velocity < min_vel


class FuzzBase(unittest.TestCase):
    CASES = 160

    def cases(self, module):
        combos = discrete_combos(module)
        for case in range(self.CASES):
            rng = random.Random(10007 * case + len(combos))
            discrete = combos[case % len(combos)]
            ppq, tsnum, tsden = random_score(rng)
            values = random_inputs(rng, module, discrete)
            yield case, rng, ppq, values

    def common_checks(self, before, after, view):
        for n in after.values():
            self.assertIsInstance(n.time, int)
            self.assertIsInstance(n.length, int)
            self.assertGreaterEqual(n.time, 0)
            self.assertTrue(0 <= n.number <= 131)
            for attr in ("velocity", "pan", "fcut", "fres", "release"):
                self.assertTrue(0.0 <= getattr(n, attr) <= 1.0, attr)
        for uid, n in after.items():
            if uid in view:
                self.assertGreaterEqual(n.length, 1, n)
            else:  # outside the selection: untouched
                self.assertEqual(repr(n), repr(before[uid]))
        self.assertTrue(set(after) <= set(before))  # nothing added


class TestFuzzFPC(FuzzBase):
    LEN = "Ghost Gate Length (Ticks @96 PPQ)"
    VEL = "Ghost Gate Velocity"

    def test_fpc_properties(self):
        for case, rng, ppq, values in self.cases(FPC):
            with self.subTest(case=case, ppq=ppq, values=values):
                before = by_uid(notes())
                view = set(run_with(FPC, values, case))
                after = by_uid(notes())
                self.common_checks(before, after, view)
                min_len = values[self.LEN] * ppq / 96.0
                min_vel = values[self.VEL]
                expected = {u for u in view if not gated(before[u], min_len, min_vel)}
                self.assertEqual(set(after) & view, expected)  # only gating deletes
                for u in expected:
                    self.assertEqual(after[u].length, before[u].length)
                    self.assertGreaterEqual(after[u].velocity, min_vel)  # survives a re-run

                # Idempotent pad mapping, and a re-run gates nothing new.
                pads = {u: after[u].number for u in expected}
                run_with(FPC, values, case + 1)
                again = by_uid(notes())
                # (if the run gated every selected note, the re-run sees the
                # whole roll, so only this run's survivors are compared)
                self.assertTrue(expected <= set(again), expected - set(again))
                self.assertEqual({u: again[u].number for u in expected}, pads)

    def test_fpc_deterministic_for_fixed_seed(self):
        for case, rng, ppq, values in itertools.islice(self.cases(FPC), 40):
            state = notes()
            outs = []
            for _ in range(2):
                flp.score._reset(ppq, flp.score._tsnum, flp.score._tsden)
                for n in state:
                    flp._add(n)
                run_with(FPC, values, 4242)
                outs.append([repr(n) for n in notes()])
            self.assertEqual(outs[0], outs[1])


class TestFuzzCleaner(FuzzBase):
    LEN = "Min Note Length (Ticks @96 PPQ)"
    VEL = "Min Velocity Gate"

    def test_cleaner_properties(self):
        for case, rng, ppq, values in self.cases(CLEANER):
            with self.subTest(case=case, ppq=ppq, values=values):
                before = by_uid(notes())
                view = set(run_with(CLEANER, values, case))
                after = by_uid(notes())
                self.common_checks(before, after, view)
                min_len = values[self.LEN] * ppq / 96.0
                expected = {u for u in view if not gated(before[u], min_len, values[self.VEL])}
                self.assertEqual(set(after) & view, expected)
                for u in expected:  # only the pitch may change
                    b, a = before[u], after[u]
                    self.assertEqual((a.time, a.length, a.velocity, a.pan, a.fcut),
                                     (b.time, b.length, b.velocity, b.pan, b.fcut))
                    if not values["Remap Drum Pitches to Pads"]:
                        self.assertEqual(a.number, b.number)
                pads = {u: after[u].number for u in expected}
                run_with(CLEANER, values, case)
                again = by_uid(notes())
                # (if the run gated every selected note, the re-run sees the
                # whole roll, so only this run's survivors are compared)
                self.assertTrue(expected <= set(again), expected - set(again))
                self.assertEqual({u: again[u].number for u in expected}, pads)

    def test_cleaner_deterministic(self):
        for case, rng, ppq, values in itertools.islice(self.cases(CLEANER), 40):
            state = notes()
            outs = []
            for _ in range(2):
                flp.score._reset(ppq, flp.score._tsnum, flp.score._tsden)
                for n in state:
                    flp._add(n)
                run_with(CLEANER, values, 1)
                outs.append([repr(n) for n in notes()])
            self.assertEqual(outs[0], outs[1])


class TestFuzzGroove(FuzzBase):
    CASES = 200
    STRUM = "Chord Strum (Ticks @96 PPQ)"

    def test_groove_properties(self):
        for case, rng, ppq, values in self.cases(GROOVE):
            with self.subTest(case=case, ppq=ppq, values=values):
                before = by_uid(notes())
                view = run_with(GROOVE, values, case)
                after = by_uid(notes())
                self.common_checks(before, after, set(view))
                self.assertEqual(set(after), set(before))  # never deletes
                max_strum = ppq / 8.0
                for u in view:
                    b, a = before[u], after[u]
                    self.assertEqual(a.number, b.number)
                    lo = max(1, int(round(b.length * 0.8)))
                    hi = max(lo, int(round(b.length * 1.25)))
                    self.assertTrue(lo <= a.length <= hi, (b.length, a.length))
                    self.assertTrue(0.10 <= a.velocity <= 0.98)
                # Chord voicing: within an onset cluster the applied shift is
                # non-decreasing low-to-high and spans at most the strum cap.
                snap = [dict(index=i, number=before[u].number, time=before[u].time, uid=u)
                        for i, u in enumerate(view)]
                for group in GROOVE.group_chords(snap, ppq / 48.0):
                    if len(group) < 2:
                        continue
                    # same voice order as the script: pitch, then onset, then index
                    group.sort(key=lambda x: (x["number"], x["time"], x["index"]))
                    shifts = [after[g["uid"]].time - g["time"] for g in group
                              if after[g["uid"]].time > 0]  # skip notes clamped at 0
                    for s0, s1 in zip(shifts, shifts[1:]):
                        self.assertGreaterEqual(s1, s0 - 1, shifts)
                    if shifts:
                        self.assertLessEqual(max(shifts) - min(shifts), max_strum + 1, shifts)
                    if values[self.STRUM] == 0 and shifts:
                        self.assertLessEqual(max(shifts) - min(shifts), 1, shifts)

    def test_groove_deterministic(self):
        for case, rng, ppq, values in itertools.islice(self.cases(GROOVE), 40):
            state = notes()
            outs = []
            for _ in range(2):
                flp.score._reset(ppq, flp.score._tsnum, flp.score._tsden)
                for n in state:
                    flp._add(n)
                run_with(GROOVE, values, 77)
                outs.append([repr(n) for n in notes()])
            self.assertEqual(outs[0], outs[1])


class TestScriptHygiene(unittest.TestCase):
    def test_scripts_use_only_public_flpianoroll_api(self):
        public = set(flp.__all__)
        for name in os.listdir(SCRIPTS_DIR):
            if not name.endswith(".pyscript"):
                continue
            src = open(os.path.join(SCRIPTS_DIR, name), encoding="utf-8").read()
            used = set(re.findall(r"\bflp\.(\w+)", src))
            self.assertTrue(used <= public, (name, used - public))


class TestShimStrictness(unittest.TestCase):
    """The shim must reject what the documented API rejects."""

    def setUp(self):
        flp._reset()

    def test_note_rejects_unknown_and_out_of_range(self):
        n = flp.Note()
        with self.assertRaises(AttributeError):
            n.volume = 0.5
        with self.assertRaises(AttributeError):
            n.velocty  # noqa: B018
        for attr, bad in (("velocity", 1.01), ("velocity", -0.1), ("pan", 1.5), ("fcut", -0.01),
                          ("fres", 2), ("number", 132), ("color", 16), ("time", -1),
                          ("pitchofs", 121), ("repeats", 15)):
            with self.assertRaises(ValueError, msg=(attr, bad)):
                setattr(n, attr, bad)
        for attr, bad in (("time", 1.5), ("length", 2.0), ("number", True), ("velocity", "1")):
            with self.assertRaises(TypeError, msg=(attr, bad)):
                setattr(n, attr, bad)
        with self.assertRaises(TypeError):
            flp.Note(number=60)

    def test_score_readonly_and_indexing(self):
        with self.assertRaises(AttributeError):
            flp.score.PPQ = 960
        with self.assertRaises(AttributeError):
            flp.score.noteCount = 3
        with self.assertRaises(AttributeError):
            flp.score.notes  # noqa: B018
        flp._add(flp._make_note(number=60, time=0, length=10))
        flp._add(flp._make_note(number=62, time=10, length=10))
        flp.score._begin_run()
        with self.assertRaises(IndexError):
            flp.score.getNote(-1)
        a = flp.score.getNote(0)
        a.number = 61  # live handle
        self.assertEqual(flp.score.getNote(0).number, 61)
        flp.score.deleteNote(0)
        self.assertEqual(flp.score.getNote(0).number, 62)  # indices shift down
        with self.assertRaises(flp.StaleNoteError):
            a.number  # noqa: B018

    def test_dialog_signatures(self):
        f = flp.ScriptDialog("t", "d")
        with self.assertRaises(TypeError):
            flp.ScriptDialog("only title")
        with self.assertRaises(TypeError):
            f.AddInputKnobInt("k", 1.5, 0, 4)
        with self.assertRaises(ValueError):
            f.AddInputKnobInt("k", 9, 0, 4)
        with self.assertRaises(TypeError):
            f.AddInputCombo("c", 3, 0)
        with self.assertRaises(ValueError):
            f.AddInputCombo("c", ["a", "b"], 2)
        with self.assertRaises(TypeError):
            f.AddInputCheckbox("x", "yes")
        f.AddInputCombo("c", "a,b,c", 1)
        f.addInputCheckbox("x", 1)
        with self.assertRaises(ValueError):
            f.AddInputCheckbox("x", True)  # duplicate name
        self.assertEqual(f.GetInputValue("c"), 1)  # combo returns the index
        self.assertIs(f.getInputValue("x"), True)
        with self.assertRaises(KeyError):
            f.GetInputValue("missing")
        with self.assertRaises(AttributeError):
            f.AddInputSlider  # noqa: B018

    def test_selection_limits_what_scripts_see(self):
        for i in range(4):
            flp._add(flp._make_note(number=60 + i, time=i * 10, length=10, selected=i % 2 == 0))
        flp.score._begin_run()
        self.assertEqual(flp.score.noteCount, 2)
        self.assertEqual([flp.score.getNote(i).number for i in range(2)], [60, 62])


if __name__ == "__main__":
    unittest.main()
