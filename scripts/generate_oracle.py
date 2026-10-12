"""Independent validation oracle, not the unavailable eht_engine.py prototype.

PySCF calculates full STO-3G overlaps; select the valence AO submatrix by label.
SciPy solves H C = S C E directly, independently of the TypeScript Lowdin/Jacobi code.
No SCF energies are used or claimed. Test coordinates are illustrative inputs.

Run from any directory: .venv/bin/python scripts/generate_oracle.py [--check]
--check compares against committed fixtures and fails on missing/stale results.
"""

import argparse
import copy
import json
from pathlib import Path

import numpy as np
import pyscf
import scipy
from pyscf import gto, lib
from scipy.linalg import eigh

lib.num_threads(1)
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tests/data/oracle.json"
PARAMETER_SOURCE = "https://github.com/greglandrum/yaehmop/blob/4ded45bb2bb7a2d38d2527c991debce9226a9066/tightbind/eht_parms.dat"
# Independently transcribed IP columns from the pinned upstream, not imported from TS.
ONSITE = {
    "H": (-13.6, None), "He": (-23.4, None), "Li": (-5.4, -3.5),
    "Be": (-10.0, -6.0), "B": (-15.2, -8.5), "C": (-21.4, -11.4),
    "N": (-26.0, -13.4), "O": (-32.3, -14.8), "F": (-40.0, -18.1),
    "Ne": (-43.2, -20.0),
}
ATOMIC_NUMBER = {symbol: z for z, symbol in enumerate(["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne"], 1)}


def electron_count(state):
    return sum(ATOMIC_NUMBER[a["element"]] - (2 if ATOMIC_NUMBER[a["element"]] > 2 else 0) for a in state["atoms"]) - state.get("charge", 0)


def calculation(state):
    total = sum(ATOMIC_NUMBER[a["element"]] for a in state["atoms"]) - state.get("charge", 0)
    mol = gto.M(
        atom=[(a["element"], a["position"]) for a in state["atoms"]],
        unit="Angstrom" if state["units"] == "angstrom" else "Bohr",
        basis="sto-3g", charge=state.get("charge", 0), spin=total % 2, verbose=0,
    )
    labels = mol.ao_labels(fmt=False)
    selected = [i for i, (_, element, shell, _) in enumerate(labels) if element in ("H", "He") or shell != "1s"]
    overlap = mol.intor("int1e_ovlp")[np.ix_(selected, selected)]
    onsite = np.array([ONSITE[labels[i][1]][0 if labels[i][2].endswith("s") else 1] for i in selected])
    h = state.get("k", 1.75) * overlap * (onsite[:, None] + onsite[None, :]) / 2
    np.fill_diagonal(h, onsite)
    energies, _ = eigh(h, overlap)
    return {
        "state": state,
        "aoLabels": [list(labels[i]) for i in selected],
        "overlap": overlap.tolist(), "onsiteEV": onsite.tolist(), "energiesEV": energies.tolist(),
    }


def energy_sum(energies, electrons):
    occupation = np.zeros(len(energies), dtype=int)
    remaining, start = electrons, 0
    for i in range(1, len(energies) + 1):
        if i == len(energies) or energies[i] - energies[start] > 1e-6:
            for _ in range(2):
                for j in range(start, i):
                    if remaining:
                        occupation[j] += 1
                        remaining -= 1
            start = i
    return float(np.dot(occupation, energies))


def generate():
    if pyscf.__version__ != "2.8.0" or np.__version__ != "2.2.6" or scipy.__version__ != "1.15.3":
        raise RuntimeError("Install scripts/requirements-oracle.txt to use the pinned oracle versions.")
    systems = json.loads((ROOT / "tests/data/systems.json").read_text())["systems"]
    basis_parameters = {}
    for symbol in ONSITE:
        shells = gto.basis.load("sto-3g", symbol)
        s_shell = shells[0 if symbol in ("H", "He") else 1][1:]
        p_shell = None if symbol in ("H", "He") else shells[2][1:]
        basis_parameters[symbol] = {
            "atomicNumber": ATOMIC_NUMBER[symbol],
            "exponents": [row[0] for row in s_shell],
            "sCoefficients": [row[1] for row in s_shell],
            "pCoefficients": None if p_shell is None else [row[1] for row in p_shell],
            "sEnergyEV": ONSITE[symbol][0], "pEnergyEV": ONSITE[symbol][1],
        }
    cases = [{"name": case["name"], **calculation(case["state"])} for case in systems]
    # Rotated, translated mixed geometry exercises all cross-axis s/p overlap terms.
    rotated = copy.deepcopy(systems[-1]["state"])
    q, _ = np.linalg.qr(np.array([[0.7, -0.3, 0.9], [0.2, 0.8, 0.5], [-0.6, 0.1, 0.4]]))
    for atom in rotated["atoms"]:
        atom["position"] = (q @ np.array(atom["position"]) + [1.3, -0.7, 0.4]).tolist()
    cases.append({"name": "rotated-mixed", **calculation(rotated)})
    # Numerical checks for candidate elements do not automatically enable them.
    for symbol in ONSITE:
        state = {"units": "angstrom", "atoms": [{"id": "atom", "element": symbol, "position": [0.2, -0.1, 0.7]}]}
        cases.append({"name": f"isolated-{symbol}", **calculation(state)})
    co2 = next(case["state"] for case in systems if case["name"] == "CO2")
    scans = []
    for electrons in [14, 16, 17, 18, 19, 20]:
        state = copy.deepcopy(co2)
        state["charge"] = 16 - electrons
        points = []
        for angle in range(90, 181, 5):
            bent = copy.deepcopy(state)
            radians = np.radians(angle)
            bent["atoms"][2]["position"] = [1.16 * np.sin(radians), 0, 1.16 * np.cos(radians)]
            result = calculation(bent)
            points.append({"angleDegrees": angle, "energiesEV": result["energiesEV"], "orbitalEnergySumEV": energy_sum(result["energiesEV"], electrons)})
        scans.append({"electrons": electrons, "state": state, "points": points})
    return {
        "metadata": {"pyscf": pyscf.__version__, "numpy": np.__version__, "scipy": scipy.__version__,
                     "basis": "STO-3G valence AO submatrix", "method": "PySCF int1e_ovlp + scipy.linalg.eigh(H, S), NOT PySCF SCF energies",
                     "parameterSource": PARAMETER_SOURCE, "inputSource": "tests/data/systems.json"},
        "basisParameters": basis_parameters, "cases": cases, "scans": scans,
    }


def compare(expected, actual, path="root"):
    if isinstance(expected, (float, int)) and not isinstance(expected, bool):
        if not isinstance(actual, (float, int)) or not np.isclose(expected, actual, rtol=0, atol=1e-9):
            raise AssertionError(f"Stale oracle fixture at {path}: {expected} != {actual}")
    elif isinstance(expected, dict):
        if expected.keys() != actual.keys():
            raise AssertionError(f"Oracle keys differ at {path}")
        for key in expected:
            compare(expected[key], actual[key], f"{path}.{key}")
    elif isinstance(expected, list):
        if len(expected) != len(actual):
            raise AssertionError(f"Oracle lengths differ at {path}")
        for i, item in enumerate(expected):
            compare(item, actual[i], f"{path}[{i}]")
    elif expected != actual:
        raise AssertionError(f"Oracle value differs at {path}: {expected!r} != {actual!r}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    generated = generate()
    if args.check:
        compare(json.loads(OUTPUT.read_text()), generated)
        print(f"Oracle reproduced: {len(generated['cases'])} cases and {len(generated['scans'])} angle scans.")
    else:
        OUTPUT.write_text(json.dumps(generated, indent=2, allow_nan=False) + "\n")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}: {len(generated['cases'])} cases and {len(generated['scans'])} angle scans.")
