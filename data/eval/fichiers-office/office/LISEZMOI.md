# Fichiers produits par Microsoft Office

Sur ce poste, l'automatisation de Word (`tools/eval/fichiers-office.ps1`) se bloque. Les fichiers de mesure viennent donc de bibliothèques (docx, SheetJS, pptxgenjs, pdf-lib). Pour mesurer aussi des fichiers réellement produits par Office, enregistrez-les **à la main** dans ce dossier, sous ces noms exacts :

| Fichier | Comment le produire |
| :--- | :--- |
| `corpus.docx` | Ouvrez `../corpus.docx` dans Word → *Fichier › Enregistrer sous* → Document Word (*.docx) → `office/corpus.docx` |
| `corpus.pdf` | Depuis le même document Word → *Fichier › Enregistrer sous* → PDF (*.pdf), option « Standard » → `office/corpus.pdf` |
| `corpus.xlsx` | Ouvrez `../corpus.xlsx` dans Excel → *Enregistrer sous* → Classeur Excel (*.xlsx) → `office/corpus.xlsx` |
| `corpus.pptx` | Ouvrez `../corpus.pptx` dans PowerPoint → *Enregistrer sous* → Présentation PowerPoint (*.pptx) → `office/corpus.pptx` |

Un nouvel enregistrement par Office suffit : il réécrit tout le fichier dans le format Office (styles, découpage du texte en segments, compression), et c'est ce que la mesure doit éprouver. Ne modifiez pas le contenu. Si Word propose une conversion ou un mode de compatibilité, acceptez.

Puis :

```bash
pnpm eval:extraction
```

Le rapport [extraction-fichiers.md](../../../../docs/evaluation/resultats/extraction-fichiers.md) ajoute alors les lignes « DOCX (Word) », « PDF texte (Word) », « XLSX (Excel) » et « PPTX (PowerPoint) », à côté des fichiers produits par les bibliothèques.
