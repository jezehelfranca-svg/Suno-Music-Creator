"""Unit tests for the FL Studio piano-roll scripts.

NOTE: these run against tests/flpianoroll.py, a strict fake of FL Studio's
`flpianoroll` module built from the documented API. They prove the scripts' logic (mapping, gating, scaling,
timing maths) only, not real FL Studio behaviour -- always sanity-check a
script inside FL's piano roll after changing it.
"""
import importlib.util
import os
import random
import sys
import unittest
from importlib.machinery import SourceFileLoader

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
SCRIPTS_DIR = os.path.dirname(TESTS_DIR)
if TESTS_DIR not in sys.path:
    sys.path.insert(0, TESTS_DIR)

import flpianoroll as flp  # noqa: E402  (the shim)


def load_script(filename):
    name = "flscript_" + os.path.splitext(filename)[0].lower()
    loader = SourceFileLoader(name, os.path.join(SCRIPTS_DIR, filename))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


FPC = load_script("FPC_Drum_Mapper_Humanizer.pyscript")
GROOVE = load_script("Groove_Humanize.pyscript")
CLEANER = load_script("Stem_MIDI_Cleaner.pyscript")

MODES = {"auto": 0, "gm": 1, "pitched": 2}


def run(module, **overrides):
    """Build the dialog, check every override names a real control, apply."""
    flp._set_inputs(overrides)
    form = module.createDialog()
    unknown = set(overrides) - set(flp._inputs(form))
    if unknown:
        raise KeyError("test overrides name no dialog control: %r" % sorted(unknown))
    if form.Execute():
        flp.score._begin_run()
        module.apply(form)
    return form


def notes():
    return flp._all_notes()


def set_notes(specs, ppq=96, tsnum=4, tsden=4):
    """specs: iterable of (number, time, length, velocity[, pan, fcut])."""
    flp._reset(ppq=ppq, tsnum=tsnum, tsden=tsden)
    for s in specs:
        n = flp._make_note(number=s[0], time=s[1], length=s[2], velocity=s[3])
        if len(s) > 4:
            n.pan = s[4]
        if len(s) > 5:
            n.fcut = s[5]
        flp._add(n)


def pitches():
    return [n.number for n in notes()]


# Inputs that survive the default gates
PITCHED_INPUT = [  # transcription-style pitches, mostly outside GM 35-59
    (28, 0, 20, 0.9), (31, 48, 20, 0.7), (52, 96, 20, 0.8), (60, 192, 20, 0.6),
    (61, 288, 20, 0.3), (72, 24, 20, 0.5), (75, 72, 120, 0.8), (80, 0, 120, 0.9),
    (64, 120, 20, 0.45), (84, 168, 20, 0.4), (41, 240, 20, 0.85), (44, 336, 20, 0.5),
]
GM_INPUT = [
    (36, 0, 20, 0.9), (38, 96, 20, 0.8), (40, 288, 20, 0.85), (42, 0, 20, 0.6),
    (44, 48, 20, 0.5), (46, 72, 80, 0.7), (49, 0, 120, 0.9), (51, 192, 40, 0.6),
    (45, 240, 20, 0.7), (37, 336, 20, 0.5), (39, 384, 20, 0.6), (35, 384, 20, 0.9),
]

FPC_QUIET_GATE = {"Ghost Gate Length (Ticks @96 PPQ)": 1, "Ghost Gate Velocity": 0.01}
CLEAN_QUIET_GATE = {"Min Note Length (Ticks @96 PPQ)": 1, "Min Velocity Gate": 0.01,
                    "Remap Drum Pitches to Pads": True}


class Base(unittest.TestCase):
    def setUp(self):
        random.seed(1234)
        flp._reset()


class TestDialogs(Base):
    def test_titles_match_contract(self):
        self.assertEqual(flp._title(FPC.createDialog()), "FPC Drum Mapper & Humanizer")
        self.assertEqual(flp._title(GROOVE.createDialog()), "Groove Humanizer")
        self.assertEqual(flp._title(CLEANER.createDialog()), "Stem MIDI Cleaner & Pad Mapper")

    def test_input_mode_combo_options(self):
        for mod in (FPC, CLEANER):
            inp = flp._inputs(mod.createDialog())["Input Mode"]
            self.assertEqual(inp["options"], ["Auto", "GM drums (pass-through)",
                                              "Pitched transcription (band map)"])


class TestRemap(Base):
    def test_fpc_remap_idempotent_all_modes(self):
        for mode in MODES.values():
            for src in (PITCHED_INPUT, GM_INPUT):
                with self.subTest(mode=mode, gm=src is GM_INPUT):
                    set_notes(src)
                    run(FPC, **{"Input Mode": mode}, **FPC_QUIET_GATE)
                    first = pitches()
                    self.assertEqual(len(first), len(src))
                    run(FPC, **{"Input Mode": mode}, **FPC_QUIET_GATE)
                    self.assertEqual(pitches(), first)

    def test_cleaner_remap_idempotent_all_modes_and_targets(self):
        for mode in MODES.values():
            for target in (0, 1):
                for src in (PITCHED_INPUT, GM_INPUT):
                    with self.subTest(mode=mode, target=target):
                        set_notes(src)
                        opts = dict(CLEAN_QUIET_GATE, **{"Input Mode": mode, "Target Pads": target})
                        run(CLEANER, **opts)
                        first = pitches()
                        run(CLEANER, **opts)
                        self.assertEqual(pitches(), first)

    def test_gm_passthrough_keeps_hats_toms_cymbals(self):
        for mode in (MODES["auto"], MODES["gm"]):
            set_notes(GM_INPUT)
            run(FPC, **{"Input Mode": mode}, **FPC_QUIET_GATE)
            expected = [36, 38, 40, 42, 44, 46, 49, 51, 45, 37, 39, 36]  # 35 folds to 36
            self.assertEqual(pitches(), expected)
            set_notes(GM_INPUT)
            run(CLEANER, **dict(CLEAN_QUIET_GATE, **{"Input Mode": mode, "Target Pads": 0}))
            self.assertEqual(pitches(), expected)

    def test_cleaner_three_pad_hats_go_to_hat_not_kick(self):
        set_notes([(42, 0, 20, 0.8), (44, 48, 20, 0.8), (46, 96, 20, 0.8), (35, 0, 20, 0.8),
                   (40, 96, 20, 0.8)])
        run(CLEANER, **dict(CLEAN_QUIET_GATE, **{"Target Pads": 1}))
        self.assertEqual(pitches(), [42, 42, 42, 36, 38])

    def test_gm_mode_leaves_non_gm_pitches_alone(self):
        set_notes([(72, 0, 20, 0.8), (90, 48, 20, 0.8)])
        run(FPC, **{"Input Mode": MODES["gm"]}, **FPC_QUIET_GATE)
        self.assertEqual(pitches(), [72, 90])

    def test_band_map_uses_crash_at_bar_start_and_ride_elsewhere(self):
        set_notes([(80, 0, 120, 0.9), (80, 96, 120, 0.9), (80, 384, 120, 0.9)])
        run(FPC, **{"Input Mode": MODES["pitched"]}, **FPC_QUIET_GATE)
        self.assertEqual(pitches(), [FPC.FPC_CRASH, FPC.FPC_RIDE, FPC.FPC_CRASH])

    def test_classifiers_identical_between_scripts(self):
        for name in ("GM_CATEGORY", "MAPPED_PADS", "GM_TO_PAD", "KICK_BAND_TOP",
                     "SNARE_BAND_TOP", "CYMBAL_BAND_LOW", "CYMBAL_MIN_BEATS", "INPUT_MODES"):
            self.assertEqual(getattr(FPC, name), getattr(CLEANER, name), name)
        for ppq in (96, 960):
            for mode in MODES.values():
                for pitch in range(128):
                    for length in (ppq // 8, ppq * 2):
                        self.assertEqual(FPC.classify_drum(pitch, length, ppq, mode),
                                         CLEANER.classify_drum(pitch, length, ppq, mode))

    def test_scripts_agree_on_kick_snare_hat_end_to_end(self):
        for mode in (MODES["auto"], MODES["pitched"]):
            for src in (PITCHED_INPUT, GM_INPUT):
                set_notes(src)
                run(FPC, **{"Input Mode": mode}, **FPC_QUIET_GATE)
                fpc_cats = [FPC.GM_CATEGORY.get(p) for p in pitches()]
                set_notes(src)
                run(CLEANER, **dict(CLEAN_QUIET_GATE, **{"Input Mode": mode, "Target Pads": 0}))
                cl_cats = [CLEANER.GM_CATEGORY.get(p) for p in pitches()]
                self.assertEqual(fpc_cats, cl_cats)
                self.assertTrue({"kick", "snare", "hat"} <= set(fpc_cats))


class TestGating(Base):
    SPECS = [(36, 0, 5, 0.9), (38, 10, 4, 0.9), (42, 20, 30, 0.05), (42, 30, 30, 0.9),
             (36, 40, 3, 0.9), (38, 50, 2, 0.02), (40, 60, 30, 0.8), (46, 70, 9, 0.9)]
    KEPT_TIMES = [30, 60]

    def test_cleaner_removes_consecutive_gated_notes_without_skipping(self):
        set_notes(self.SPECS)
        run(CLEANER, **{"Min Note Length (Ticks @96 PPQ)": 10, "Min Velocity Gate": 0.18})
        self.assertEqual([n.time for n in notes()], self.KEPT_TIMES)

    def test_fpc_removes_consecutive_gated_notes_without_skipping(self):
        set_notes(self.SPECS)
        run(FPC, **{"Ghost Gate Length (Ticks @96 PPQ)": 10, "Ghost Gate Velocity": 0.16,
                    "Remap Pitches to FPC Factory Pads": False,
                    "Timing Pocket Jitter (Ticks @96 PPQ)": 0, "Snare Lay-Back (Ticks @96 PPQ)": 0})
        # remap off: survivors identified by pitch (hat push may nudge time)
        self.assertEqual(pitches(), [42, 40])

    def test_gate_length_scales_with_ppq(self):
        set_notes([(36, 0, 90, 0.9), (36, 960, 100, 0.9)], ppq=960)
        run(CLEANER, **{"Min Note Length (Ticks @96 PPQ)": 10})
        self.assertEqual([n.length for n in notes()], [100])


class TestTiming(Base):
    def _groove_shifts(self, ppq, factor):
        random.seed(99)
        base = [(60, 0, 24, 0.7), (62, 50, 24, 0.7), (64, 130, 24, 0.7), (60, 200, 24, 0.7)]
        set_notes([(p, t * factor, l * factor, v) for p, t, l, v in base], ppq=ppq)
        orig = [n.time for n in notes()]
        run(GROOVE, **{"Timing Jitter (Ticks @96 PPQ)": 12})
        return [n.time - o for n, o in zip(notes(), orig)]

    def test_groove_shifts_scale_with_ppq(self):
        s96 = self._groove_shifts(96, 1)
        s960 = self._groove_shifts(960, 10)
        self.assertTrue(any(s != 0 for s in s96))
        for a, b in zip(s96, s960):
            self.assertLessEqual(abs(b - 10 * a), 6)

    def _fpc_shifts(self, ppq, factor):
        random.seed(7)
        base = [(42, 24, 12, 0.6), (40, 96, 12, 0.8), (42, 168, 12, 0.6), (36, 200, 12, 0.9)]
        set_notes([(p, t * factor, l * factor, v) for p, t, l, v in base], ppq=ppq)
        orig = [n.time for n in notes()]
        run(FPC, **FPC_QUIET_GATE)
        return [n.time - o for n, o in zip(notes(), orig)]

    def test_fpc_shifts_scale_with_ppq(self):
        s96 = self._fpc_shifts(96, 1)
        s960 = self._fpc_shifts(960, 10)
        for a, b in zip(s96, s960):
            self.assertLessEqual(abs(b - 10 * a), 6)

    def test_timing_never_negative(self):
        for seed in range(30):
            random.seed(seed)
            set_notes([(60, 0, 24, 0.8), (64, 1, 24, 0.8), (67, 2, 24, 0.8), (72, 3, 24, 0.8)])
            run(GROOVE, **{"Timing Jitter (Ticks @96 PPQ)": 24})
            self.assertTrue(all(n.time >= 0 for n in notes()))
            set_notes([(42, 0, 24, 0.8), (38, 1, 24, 0.8), (36, 2, 24, 0.8)])
            run(FPC, **{"Timing Pocket Jitter (Ticks @96 PPQ)": 20,
                        "Snare Lay-Back (Ticks @96 PPQ)": -8}, **FPC_QUIET_GATE)
            self.assertTrue(all(n.time >= 0 for n in notes()))
            self.assertTrue(all(isinstance(n.time, int) for n in notes()))

    def test_velocities_clamped(self):
        for seed in range(20):
            random.seed(seed)
            set_notes([(60, i * 24, 24, v) for i, v in enumerate((0.0, 0.05, 0.5, 1.0, 1.0))])
            run(GROOVE, **{"Velocity Spread": 0.25})
            self.assertTrue(all(0.10 <= n.velocity <= 0.98 for n in notes()))
            set_notes([(p, i * 24, 24, v) for i, (p, v) in
                       enumerate(((36, 1.0), (40, 1.0), (42, 0.02), (46, 1.0), (49, 1.0)))])
            run(FPC, **{"FPC Layer Cycling Spread": 0.30}, **FPC_QUIET_GATE)
            self.assertTrue(all(0.15 <= n.velocity <= 0.98 for n in notes()))


class TestGroove(Base):
    STILL = {"Timing Jitter (Ticks @96 PPQ)": 0, "Chord Strum (Ticks @96 PPQ)": 0,
             "Velocity Spread": 0.0}

    def test_chord_tolerance_grouping_and_strum_cap(self):
        # Three notes within PPQ/48 (=2 ticks) of each other form a chord;
        # strum knob at max (16) is capped so total spread <= PPQ/8 (=12).
        set_notes([(67, 2, 48, 0.7), (60, 0, 48, 0.7), (64, 1, 48, 0.7), (72, 10, 48, 0.7)])
        run(GROOVE, **dict(self.STILL, **{"Chord Strum (Ticks @96 PPQ)": 16,
                                          "Pull Backbeat (Laid-Back Feel)": False}))
        by_pitch = {n.number: n.time for n in notes()}
        self.assertEqual(by_pitch[60], 0)
        self.assertEqual(by_pitch[64], 1 + 6)
        self.assertEqual(by_pitch[67], 2 + 12)
        self.assertEqual(by_pitch[72], 10)  # outside the window: not strummed

    def test_strum_cap_scales_with_ppq_and_chord_size(self):
        set_notes([(60 + i, 0, 480, 0.7) for i in range(6)], ppq=960)
        run(GROOVE, **dict(self.STILL, **{"Chord Strum (Ticks @96 PPQ)": 16,
                                          "Pull Backbeat (Laid-Back Feel)": False}))
        times = [n.time for n in notes()]
        self.assertEqual(max(times) - min(times), 960 // 8)

    def test_backbeat_only_moves_on_beat_onsets(self):
        set_notes([(60, 0, 24, 0.7), (60, 96, 24, 0.7), (60, 120, 24, 0.7),
                   (60, 192, 24, 0.7), (60, 290, 24, 0.7), (60, 312, 24, 0.7)])
        run(GROOVE, **dict(self.STILL, **{"Pull Backbeat (Laid-Back Feel)": True,
                                          "Backbeat Pull (Ticks @96 PPQ)": 3}))
        self.assertEqual([n.time for n in notes()], [0, 99, 120, 192, 293, 312])

    def test_backbeat_respects_time_signature(self):
        # In 3/4, tick 288 is the downbeat of bar 2 (no pull); 96 is beat 2.
        set_notes([(60, 96, 24, 0.7), (60, 288, 24, 0.7)], tsnum=3, tsden=4)
        run(GROOVE, **dict(self.STILL, **{"Pull Backbeat (Laid-Back Feel)": True}))
        self.assertEqual([n.time for n in notes()], [99, 288])

    def test_length_jitter_never_inflates_short_notes(self):
        for seed in range(20):
            random.seed(seed)
            set_notes([(60, i * 48, 3, 0.7) for i in range(4)] + [(60, 400, 100, 0.7)])
            run(GROOVE)
            lengths = [n.length for n in notes()]
            self.assertTrue(all(2 <= l <= 4 for l in lengths[:4]), lengths)
            self.assertTrue(80 <= lengths[4] <= 125)


class TestRelativeFilterPan(Base):
    def test_fcut_and_pan_relative_to_existing(self):
        for seed in range(20):
            random.seed(seed)
            set_notes([(42, 0, 24, 0.7, 0.9, 0.2), (42, 48, 24, 0.7, 0.1, 0.85)])
            run(FPC, **FPC_QUIET_GATE)
            a, b = notes()
            self.assertLessEqual(abs(a.fcut - 0.2), 0.15)
            self.assertLessEqual(abs(a.pan - 0.9), 0.06)
            self.assertLessEqual(abs(b.fcut - 0.85), 0.15)
            self.assertLessEqual(abs(b.pan - 0.1), 0.06)

    def test_pan_untouched_for_kick(self):
        set_notes([(36, 0, 24, 0.9, 0.3, 0.5)])
        run(FPC, **FPC_QUIET_GATE)
        self.assertEqual(notes()[0].pan, 0.3)


if __name__ == "__main__":
    unittest.main()
