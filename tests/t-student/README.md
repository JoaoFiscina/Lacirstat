# Modulo t de Student

## Entrada manual rapida

- Cole os valores do `Grupo A` e do `Grupo B` em caixas separadas.
- No `t pareado`, use a mesma ordem das unidades nas duas colunas e, se quiser, preencha a caixa de `Unidades / labels`.
- O parser aceita colagem do Excel com quebras de linha e tabulacao, remove espacos extras e ignora linhas vazias.

## Formato padrao de upload

Formato recomendado:

`unidade | grupo_a | grupo_b | observacao_opcional`

- Cada linha representa uma observacao ou unidade analitica.
- `grupo_a` e `grupo_b` entram no calculo.
- `observacao_opcional` e apenas descritiva.
- No `t pareado`, a mesma linha representa a mesma unidade nas duas colunas.
- No `t independente`, as duas colunas podem ser aproveitadas mesmo sem pareamento, desde que haja dados validos.

## Aliases aceitos

- `unidade`: `unidade`, `uf`, `unidade_analitica`, `unidade analitica`, `estado`
- `grupo_a`: `grupo_a`, `grupo a`, `grupo1`, `grupo_1`, `grupo 1`
- `grupo_b`: `grupo_b`, `grupo b`, `grupo2`, `grupo_2`, `grupo 2`
- `observacao_opcional`: `observacao`, `obs`, `comentario`

## Diferenca entre os modos

- `t independente`: compara `Grupo A` e `Grupo B` como grupos distintos; cada grupo precisa ter pelo menos 2 observacoes validas.
- `t pareado`: compara pares linha a linha; `Grupo A` e `Grupo B` precisam ter o mesmo numero de linhas validas e manter a mesma ordem das unidades.
