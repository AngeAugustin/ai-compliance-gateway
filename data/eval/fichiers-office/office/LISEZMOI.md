# Fichiers produits par Microsoft Office

Sur ce poste, l'automatisation de Word (`tools/eval/fichiers-office.ps1`) se bloque. Les fichiers de mesure viennent donc de bibliothèques (docx, SheetJS, pptxgenjs, pdf-lib). Pour mesurer aussi des fichiers réellement produits par Office, enregistrez-les **à la main** dans ce dossier, sous ces noms exacts :

| Fichier | Comment le produire |
| :--- | :--- |
| `corpus.docx` | Ouvrez `../corpus.docx` dans Word → *Fichier › Enregistrer sous* → Document Word (*.docx) → `office/corpus.docx` |
| `corpus.pdf` | Depuis le même document Word → *Fichier › Enregistrer sous* → PDF (*.pdf), option « Standard » → `office/corpus.pdf` |
| `corpus.xlsx` | Ouvrez `../corpus.xlsx` dans Excel → *Enregistrer sous* → Classeur Excel (*.xlsx) → `office/corpus.xlsx` |
| `corpus.pptx` | Ouvrez `../corpus.pptx` dans PowerPoint → *Enregistrer sous* → Présentation PowerPoint (*.pptx) → `office/corpus.pptx` |

Un nouvel enregistrement par Office suffit : il réécrit tout le fichier dans le format Office (styles, découpage du texte en segments, compression), et c'est ce que la mesure doit éprouver. Ne modifiez pas le contenu. Si Word propose une conversion ou un mode de compatibilité, acceptez.

**Mesure faite le 12/11/2026** (Office 2016) : DOCX, XLSX, PPTX 100 %, PDF de Word 99,0 %, 100 % des secrets, après correction de deux défauts révélés par ces fichiers ([protocole-detection.md](../../../../docs/evaluation/protocole-detection.md), § 5 quinquies).

**Résultat attendu avant la mesure** : les mêmes taux que les fichiers des bibliothèques, soit 100 % des valeurs pour DOCX, XLSX et PPTX, au moins 99 % pour le PDF, et 100 % des secrets détectés. L'extracteur lit le format (XML Office, flux PDF), pas l'outil qui l'a produit. Un écart viendrait du découpage du texte en segments par Word, que les bibliothèques ne reproduisent pas.

Puis :

```bash
pnpm eval:extraction
```

Le rapport [extraction-fichiers.md](../../../../docs/evaluation/resultats/extraction-fichiers.md) ajoute alors les lignes « DOCX (Word) », « PDF texte (Word) », « XLSX (Excel) » et « PPTX (PowerPoint) », à côté des fichiers produits par les bibliothèques.
