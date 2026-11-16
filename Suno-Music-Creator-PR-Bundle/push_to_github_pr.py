#!/usr/bin/env python3
"""
Automated Git Clone, Branch, Commit, Push & Pull Request Script
Target Repository: https://github.com/jezehelfranca-svg/Suno-Music-Creator.git
Run this script locally or inside Antigravity 2.0 to push all files and open the PR.
"""
import os
import shutil
import subprocess
from pathlib import Path

REPO_URL = "https://github.com/jezehelfranca-svg/Suno-Music-Creator.git"
BRANCH_NAME = "feat/suno-humanizer-pipeline"
PR_TITLE = "feat: Add Zero-Fingerprint Suno Humanizer Pipeline, Scripts & Workflow Docs"
PR_BODY = (
    "## Summary\n"
    "- Adds complete **Suno-to-Human Production Pipeline** documentation (`README.md`, `docs/WORKFLOW_GUIDE.md`) covering FL Studio, FPC, MPC 3 Beats, Moises, Scaler 3.1, and TONIQ.\n"
    "- Adds **Antigravity 2.0 FFmpeg Scrubber & Drum Trigger Daemon** (`scripts/antigravity/suno_scrubber_daemon.py`).\n"
    "- Adds **FL Studio Piano Roll Humanizer & Mapper Scripts** (`FPC_Moises_Humanizer.pyscript`, `Gaussian_Humanize.pyscript`, `Stem_MIDI_Cleaner.pyscript`).\n"
    "- Adds **Multi-Agent System Prompts** (`prompts/AI_AGENT_PROMPTS.md`) for MoiAI, Claude, Gemini, and ChatGPT."
)

def run_cmd(cmd, cwd=None, check=True):
    print(f"[exec] {' '.join(cmd)}")
    return subprocess.run(cmd, cwd=cwd, check=check)

def main():
    bundle_root = Path(__file__).resolve().parent
    work_dir = bundle_root / "_repo_clone"

    if work_dir.exists():
        shutil.rmtree(work_dir)

    # 1. Clone target repository
    run_cmd(["git", "clone", REPO_URL, str(work_dir)])

    # 2. Checkout new feature branch
    run_cmd(["git", "checkout", "-b", BRANCH_NAME], cwd=work_dir)

    # 3. Copy all bundle files into the cloned repository
    for item in ["README.md", "docs", "prompts", "scripts"]:
        src = bundle_root / item
        dst = work_dir / item
        if src.is_dir():
            shutil.copytree(src, dst, dirs_exist_ok=True)
        elif src.is_file():
            shutil.copy2(src, dst)

    # 4. Stage, commit, and push
    run_cmd(["git", "add", "."], cwd=work_dir)
    run_cmd(["git", "commit", "-m", PR_TITLE], cwd=work_dir)
    run_cmd(["git", "push", "-u", "origin", BRANCH_NAME], cwd=work_dir)

    # 5. Create Pull Request via GitHub CLI (if installed), else print direct PR link
    try:
        run_cmd(["gh", "pr", "create", "--title", PR_TITLE, "--body", PR_BODY, "--head", BRANCH_NAME], cwd=work_dir)
        print("[+] Pull Request successfully created via GitHub CLI!")
    except Exception:
        print("\n[*] Branch pushed! Open your Pull Request directly at:")
        print(f"    https://github.com/jezehelfranca-svg/Suno-Music-Creator/compare/{BRANCH_NAME}?expand=1")

if __name__ == "__main__":
    main()
