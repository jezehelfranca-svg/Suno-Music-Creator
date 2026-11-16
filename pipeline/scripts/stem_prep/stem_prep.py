import os
import time
import shutil
import subprocess
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

BASE_DIR = Path("C:/Music_Pipeline")
MOISES_DIR = BASE_DIR / "02_Moises_Stems"
PROJECT_DIR = BASE_DIR / "04_FL_Project_Ready"
TEMPLATE_FLP = BASE_DIR / "Templates" / "Humanizer_Template.flp"

def scrub_stem(input_wav: Path, output_wav: Path, is_vocal: bool = False):
    """
    Breaks spectral watermarks via -5 cent pitch/tempo compensation,
    allpass phase rotation, and targeted high-frequency phase-smear roll-off.
    """
    lowpass_freq = "16200" if is_vocal else "13500"
    highpass_freq = "90" if is_vocal else "40"

    # 0.9971 = ~-5 cents shift; 1/0.9971 = 1.002908 tempo restore
    af_chain = (
        f"asetrate=48000*0.9971,aresample=48000,atempo=1.002908,"
        f"highpass=f={highpass_freq}:poles=2,"
        f"lowpass=f={lowpass_freq}:poles=2,"
        f"allpass=f=1400:width_type=q:w=0.707,"
        f"equalizer=f=4600:width_type=q:w=3.5:g=-3.5"
    )

    cmd = [
        "ffmpeg", "-y", "-i", str(input_wav),
        "-af", af_chain,
        "-c:a", "pcm_s24le", "-ar", "48000",
        str(output_wav)
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

def split_drum_triggers(drum_wav: Path, triggers_dir: Path):
    """
    Pre-splits the Moises drum stem into gated Kick, Snare, and Hi-Hat trigger WAVs
    so FL Studio Edison converts them into clean, separated MIDI notes immediately.
    """
    triggers_dir.mkdir(parents=True, exist_ok=True)
    filters = {
        "Kick_Trigger.wav": "lowpass=f=120:poles=2,agate=threshold=0.05",
        "Snare_Trigger.wav": "bandpass=f=800:width_type=h:w=1200,agate=threshold=0.06",
        "Hat_Trigger.wav": "highpass=f=6500:poles=2,agate=threshold=0.03"
    }
    for filename, af_filter in filters.items():
        out_path = triggers_dir / filename
        cmd = [
            "ffmpeg", "-y", "-i", str(drum_wav),
            "-af", af_filter,
            "-c:a", "pcm_s24le", "-ar", "48000",
            str(out_path)
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

class StemFolderHandler(FileSystemEventHandler):
    def on_created(self, event):
        if not event.is_directory:
            return
        
        song_folder = Path(event.src_path)
        print(f"[+] Detected new Moises stem folder: {song_folder.name}")
        time.sleep(5)  # Allow MoiAI to finish writing all WAV files

        target_proj = PROJECT_DIR / song_folder.name
        stems_out = target_proj / "Audio_Stems"
        triggers_out = target_proj / "Drum_MIDI_Triggers"
        stems_out.mkdir(parents=True, exist_ok=True)

        for wav_file in song_folder.glob("*.wav"):
            stem_name = wav_file.stem.lower()
            is_vocal = "vocal" in stem_name
            out_file = stems_out / f"{wav_file.stem}_scrubbed.wav"
            scrub_stem(wav_file, out_file, is_vocal=is_vocal)
            print(f"    [OK] Scrubbed & de-watermarked: {out_file.name}")

            if "drum" in stem_name:
                split_drum_triggers(wav_file, triggers_out)
                print(f"    [OK] Generated Kick/Snare/Hat MIDI trigger WAVs in: {triggers_out.name}")

        if TEMPLATE_FLP.exists():
            shutil.copy2(TEMPLATE_FLP, target_proj / f"{song_folder.name}.flp")
            print(f"[*] Project ready in: {target_proj}")

if __name__ == "__main__":
    for folder in [MOISES_DIR, PROJECT_DIR]:
        folder.mkdir(parents=True, exist_ok=True)
    observer = Observer()
    observer.schedule(StemFolderHandler(), str(MOISES_DIR), recursive=False)
    observer.start()
    print("[*] Antigravity 2.0 Audio Scrubber & Drum Trigger Daemon Active...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
