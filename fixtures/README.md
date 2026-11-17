# Fixture sintética

`family.fixture.json` é uma família fictícia, sem relação com o seed do protótipo. Ela existe para exercitar os casos que o modelo antigo não representava e para servir de base aos testes das próximas fases.

## Cenários cobertos

| Cenário | Onde aparece |
| --- | --- |
| Segundo casamento | Carlos + Renata (divorciado) e Carlos + Marina (casado) |
| Meios-irmãos | Gabriel (filho de Renata) × Helena e Igor (filhos de Marina) |
| Cinco filhos na mesma união | Beatriz + Roberto → Ana, Bruno, Caio, Dora e Enzo |
| União sem filhos | Gabriel + Sofia |
| União monoparental | Dora, com Otávio; outro genitor não informado |
| Família do cônjuge | Joana + Paulo → Marina e Rafael |
| Múltiplas gerações | Augusto/Lúcia → Beatriz/Carlos → netos → bisnetos |
| Esposa com irmão | Marina e Rafael são irmãos |

## Contagens esperadas

- 22 pessoas
- 8 uniões
- 14 vínculos pai/filho
- 4 gerações a partir de Augusto
- 2 uniões de Carlos
- 5 filhos na união de Beatriz + Roberto

## Validação

A fixture é validada pelo domínio em `src/domain/validate.test.ts` e usada pelos testes de grafo e relacionamento:

```bash
npm test
```

Os testes conferem referências, unicidade, ciclos, união parental única, datas, idades e os cenários acima.
