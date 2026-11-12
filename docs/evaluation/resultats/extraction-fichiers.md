# Précision de l'extraction de fichiers

Date : 2026-11-12 · corpus manuel annoté (65 prompts, 97 valeurs annotées) écrit dans des fichiers produits par des outils tiers (voir « Producteur des fichiers »). Moteur de détection sans NER (règles + mots-clés).

| Format | Fichiers | Échecs | Dégradés | Temps moyen | Valeurs conservées | Mots conservés | Détection sur le source | Détection sur l'extrait | Secrets détectés |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| DOCX | 1 | 0 | 0 | 167 ms | 100,0 % (97/97) | 100,0 % | 46,4 % | 45,4 % | 100,0 % (8/8) |
| PDF texte | 1 | 0 | 0 | 2404 ms | 99,0 % (96/97) | 99,8 % | 46,4 % | 45,4 % | 100,0 % (8/8) |
| XLSX | 1 | 0 | 0 | 37 ms | 100,0 % (97/97) | 100,0 % | 46,4 % | 45,4 % | 100,0 % (8/8) |
| PPTX | 1 | 0 | 0 | 10 ms | 100,0 % (97/97) | 100,0 % | 46,4 % | 45,4 % | 100,0 % (8/8) |
| PDF scanné (images seules) | 1 | 0 | 0 | 4635 ms | 94,7 % (18/19) | 99,4 % | 52,6 % | 42,1 % | 100,0 % (1/1) |
| DOCX (Word) | 1 | 0 | 0 | 22 ms | 100,0 % (97/97) | 100,0 % | 46,4 % | 46,4 % | 100,0 % (8/8) |
| PDF texte (Word) | 1 | 0 | 0 | 265 ms | 99,0 % (96/97) | 99,8 % | 46,4 % | 45,4 % | 100,0 % (8/8) |
| XLSX (Excel) | 1 | 0 | 0 | 27 ms | 100,0 % (97/97) | 100,0 % | 46,4 % | 45,4 % | 100,0 % (8/8) |
| PPTX (PowerPoint) | 1 | 0 | 0 | 275 ms | 100,0 % (97/97) | 100,0 % | 46,4 % | 45,4 % | 100,0 % (8/8) |
| Image PNG (OCR) | 65 | 0 | 0 | 2238 ms | 95,9 % (93/97) | 99,5 % | 45,4 % | 40,2 % | 100,0 % (8/8) |

## Producteur des fichiers

- DOCX : docx 9 (bibliothèque JavaScript)
- PDF texte : pdf-lib 1.17, Helvetica WinAnsi (1 caractère(s) hors encodage remplacé(s))
- XLSX : SheetJS 0.18
- PPTX : pptxgenjs 4
- PDF scanné (images seules) : pdf-lib 1.17 (10 images PNG pleine page, aucune couche texte)
- DOCX (Word) : Microsoft Office, enregistré à la main (office/LISEZMOI.md)
- PDF texte (Word) : Microsoft Office, enregistré à la main (office/LISEZMOI.md)
- XLSX (Excel) : Microsoft Office, enregistré à la main (office/LISEZMOI.md)
- PPTX (PowerPoint) : Microsoft Office, enregistré à la main (office/LISEZMOI.md)
- Images PNG : System.Drawing (Arial 26 px, fond blanc)

## Valeurs perdues (exemples)

- PDF texte : PRIVATE_KEY « -----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA7vQ3mZ8xK2LpR9tYwN4cB6dF1gH3jK5mN7pQ9rS2tU4vW6xY
8zA1bC3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9dE1fG3hI5jK7lM9nO
-----END RSA PRIVATE KEY----- »
- PDF scanné (images seules) : API_KEY « sk-abcdefghijklmnopqrstuvwxyz012345 »
- PDF texte (Word) : PRIVATE_KEY « -----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA7vQ3mZ8xK2LpR9tYwN4cB6dF1gH3jK5mN7pQ9rS2tU4vW6xY
8zA1bC3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9dE1fG3hI5jK7lM9nO
-----END RSA PRIVATE KEY----- »
- Image PNG (OCR) : API_KEY « sk-abcdefghijklmnopqrstuvwxyz012345 » ; API_KEY « ghp_8xK2mQ9vL4nR7tY1wZ3pA6sD0fG5hJ8kL2qW » ; PRIVATE_KEY « -----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA7vQ3mZ8xK2LpR9tYwN4cB6dF1gH3jK5mN7pQ9rS2tU4vW6xY
8zA1bC3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9dE1fG3hI5jK7lM9nO
-----END RSA PRIVATE KEY----- » ; API_KEY « eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbi1jbnNzIiwicm9sZSI6IkFETUlOIn0.k3Jp0Q9w2vX8tB1nM4cZ7yL6aE5sD3fG2hJ1kL0qW9e »

## Lecture

- « Valeurs conservées » : la valeur annotée figure telle quelle (espaces normalisés) dans le texte extrait. Une valeur perdue ne peut pas être détectée, donc ni masquée ni bloquée.
- « Détection » : rappel du même moteur sur le texte source et sur le texte extrait ; l'écart entre les deux colonnes est la perte imputable à l'extraction.
- « Secrets détectés » : clés d'API, clés privées, mots de passe et chaînes de connexion que le moteur détecte encore dans l'extrait, même lus avec quelques caractères faux (similarité ≥ 0,8) : ils seront bloqués ou masqués. C'est l'indicateur de sécurité ; « valeurs conservées » mesure la fidélité.

## Limites

- Mise en forme simple (paragraphes, cellules, une diapositive par prompt) ; tableaux complexes, en-têtes et pieds de page, colonnes multiples et documents réellement numérisés (bruit, inclinaison) ne sont pas couverts.
- Les images sont rendues proprement (police nette, fond blanc) : c'est un plafond pour l'OCR, pas une estimation sur des photos ou des scans.
