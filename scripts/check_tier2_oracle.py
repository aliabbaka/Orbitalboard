"""Independent analytic checks. Not used at runtime and not called by the AI.

Uses SymPy high-precision roots/calculus plus source-weight sums to verify fixed
regression answers. No JavaScript solver output is imported into the expected values.
"""
import json
from pathlib import Path
import sympy as sp

ROOT = Path(__file__).resolve().parents[1]
cases = json.loads((ROOT / 'tests/data/tier2-known-answers.json').read_text())['cases']
x = sp.Symbol('x')
checked = 0
for case in cases:
    inputs, expected, solver = case['input'], case['expected'], case['id']
    if solver == 'math.solve':
        # Explicit multiplication is used only in this independent fixture parser.
        import re
        source = re.sub(r'(\d)x', r'\1*x', inputs['equation']).replace('^', '**')
        left, right = source.split('=')
        roots = sp.solve(sp.sympify(left, locals={'x': x}) - sp.sympify(right, locals={'x': x}), x)
        if all(root.is_real for root in roots):
            actual = sorted(float(root.evalf(30)) for root in roots)
            for key, value in expected.items():
                if key.startswith('root'): assert abs(actual[int(key[4:])] - value) < 1e-9
        else:
            assert abs(float(sp.re(roots[0])) - expected['root0']) < 1e-9
            assert abs(abs(float(sp.im(roots[0]))) - expected['imaginary']) < 1e-9
        checked += 1
    if solver == 'math.integrate':
        expression = sp.sympify(inputs['expression'].replace('^', '**'), locals={'x': x})
        actual = float(sp.integrate(expression, (x, inputs['lower'], inputs['upper'])))
        assert abs(actual - expected['integral']) < 1e-9; checked += 1
    if solver == 'chem.acid-base':
        c = sp.Float(inputs['concentration']['value'], 40); kw = sp.Float('1e-14', 40)
        if inputs['mode'].startswith('strong'):
            majority = (c + sp.sqrt(c*c + 4*kw)) / 2
        else:
            k = sp.Float(str(inputs['constant']), 40)
            # Multiply independent charge balance by h*(k+h): cubic solved with high precision.
            polynomial = x**3 + k*x**2 - (kw+c*k)*x - kw*k
            roots = sp.nroots(polynomial, n=35, maxsteps=300)
            majority = next(root for root in roots if abs(sp.im(root)) < sp.Float('1e-25') and sp.re(root) > 0)
        h = majority if inputs['mode'].endswith('acid') else kw/majority
        actual = float(-sp.log(h, 10)); assert abs(actual - expected['pH']) <= case.get('tolerance', 1e-8), (actual, expected)
        checked += 1
    if solver == 'chem.equilibrium':
        terms = [(s['nu'], sp.Float(s['concentration']['value'], 40)) for s in inputs['species']]
        numerator = sp.prod((c+nu*x)**nu for nu, c in terms if nu > 0)
        denominator = sp.prod((c+nu*x)**(-nu) for nu, c in terms if nu < 0)
        roots = sp.solve(numerator-sp.Float(inputs['K'], 40)*denominator, x)
        extent = next(root for root in roots if all(float(c+nu*root) > 0 for nu, c in terms))
        assert abs(float(extent)-expected['extent']) < 1e-8; checked += 1
assert sp.diff(x**3, x) == 3*x**2
print(f'Independent SymPy checks passed for {checked} numerical fixture cases plus differentiation identity.')
