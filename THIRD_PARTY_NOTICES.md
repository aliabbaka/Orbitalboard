# Third-party notices

No CircuitLab source code is redistributed in OrbitalBoard.

## STO-3G numerical basis data / PySCF

The small H–Ne numerical subset is transcribed from PySCF v2.8.0 `pyscf/gto/basis/sto-3g.dat`, credited there to EMSL Basis Set Exchange and the original literature. PySCF is distributed under Apache License 2.0: https://github.com/pyscf/pyscf/blob/v2.8.0/LICENSE.

Copyright 2014–2020 The PySCF Developers. All rights reserved. An Apache License 2.0 copy is in `licenses/apache-2.0.txt`. Our solver implementation is new; no PySCF integral/eigensolver code is copied. PySCF is used as an optional independently installed development oracle.

## YAeHMOP atomic IP parameters

The H–Ne on-site IP values are transcribed from `tightbind/eht_parms.dat` at commit `4ded45bb2bb7a2d38d2527c991debce9226a9066`. No Slater exponents, code or algorithms are redistributed from that project. The following notice is retained from its `license.txt`:

> Copyright (C) 1995 Greg Landrum
> All rights reserved
>
> This file is part of yaehmop.
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are
> met:
>
> 1. Redistributions of source code must retain the above copyright
> notice, this list of conditions and the following disclaimer.
>
> 2. Redistributions in binary form must reproduce the above copyright
> notice, this list of conditions and the following disclaimer in the
> documentation and/or other materials provided with the distribution.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
> "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
> LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
> A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
> HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
> SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
> LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
> DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
> THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
> (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
> OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Chemistry reference facts

OpenStax Chemistry 2e §8.4 is cited for diatomic bond-order/occupancy facts and standard diagram conventions. No questions, figures or prose are copied. Future textbook-content reuse must check the applicable licensing; source material is not assumed unrestricted.

## Project license

A license for newly authored OrbitalBoard code has not been chosen by the owner. The `private` package flag prevents accidental npm publication; it does not select a software license or make the code public domain.
