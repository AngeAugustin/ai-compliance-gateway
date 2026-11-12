# Vérification de l'extension sur les vrais services d'IA

Les tests automatisés de l'extension ([extension.e2e.ts](../../../apps/agent-browser/e2e/extension.e2e.ts)) tournent sur une **page simulée** servie à l'adresse chatgpt.com. Cette page imite la structure de ChatGPT, mais les vrais sites changent leur page sans préavis : un sélecteur qui ne trouve plus la zone de saisie, et l'extension ne voit plus rien.

Pourquoi ce n'est pas automatisé :
- il faut un compte connecté sur chaque service ;
- ces sites bloquent les navigateurs pilotés ;
- un test automatique enverrait des prompts à des services tiers.

La vérification se fait donc **à la main**, avec des données **fictives** uniquement.

## Préparation

- Extension compilée (`pnpm agents:build`), chargée dans Chrome : *chrome://extensions* › Mode développeur › *Charger l'extension non empaquetée* › `apps/agent-browser/dist`.
- Enrôlement depuis la fenêtre de l'extension, avec un jeton A1 du tableau de bord (API et base de démonstration).
- Un compte de test sur chaque service, sans historique sensible.
- **Ne jamais utiliser de vraie donnée** : uniquement les prompts ci-dessous, tous fictifs.

## Prompts de vérification

| N° | Prompt (à copier tel quel) | Attendu |
| :-- | :-- | :-- |
| P1 | Propose trois idées de titre pour la note de service sur le télétravail. | Envoyé tel quel (ALLOW) |
| P2 | Ma clé sk-abcdefghijklmnopqrstuvwxyz012345 ne marche pas, pourquoi ? | Bloqué, message de l'extension, rien n'est envoyé |
| P3 | Rédige un courrier pour l'assuré n° CNSS A12345678 (koffi.adjovi@exemple.bj) au sujet de son dossier. | Envoyé masqué (politique « Identifiants CNSS ») : le service reçoit des jetons à la place du numéro et de l'adresse ; les valeurs s'affichent dans le panneau de l'extension, jamais dans la page |

**Correction du 12/11/2026.** La première version de P3 ne contenait qu'une adresse e-mail. Aucune politique livrée ne masque une adresse seule (risque modéré, 40 à 42) : le serveur a décidé ALLOW, et l'extension a envoyé le prompt en clair, conformément à la décision. Le résultat attendu du protocole était donc faux, pas l'extension. P3 contient désormais un numéro d'assuré, que la politique « Identifiants CNSS » masque. Qu'une adresse e-mail seule passe en clair reste un choix de politique, à discuter avec le RSSI et le DPO.
| P4 | Pièces jointes `data/fixtures-fichiers/03-MASK-assures.csv` puis `08-BLOCK-medical.txt` (fichiers fictifs) | Le premier est envoyé anonymisé, le second est bloqué |

## Grille par site

Pour chaque site, cocher : ✅ conforme, ❌ non conforme (noter ce qui s'est passé), — non applicable.

| Site | Version de la page (date) | P1 Entrée | P1 bouton | P2 Entrée | P2 bouton | P3 masqué | P3 panneau | P4 fichier | Événements au journal |
| :-- | :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| chatgpt.com | | | | | | | | | |
| gemini.google.com | | | | | | | | | |
| claude.ai | | | | | | | | | |
| copilot.microsoft.com | | | | | | | | | |
| chat.mistral.ai | | | | | | | | | |
| chat.deepseek.com | | | | | | | | | |
| www.perplexity.ai | | | | | | | | | |
| grok.com | | | | | | | | | |

- **Entrée / bouton** : envoyer avec la touche Entrée, puis avec le bouton d'envoi du site.
- **Masqué** : vérifier dans les outils de développement (onglet Réseau, requête d'envoi) que le corps contient le jeton et pas l'adresse.
- **Événements au journal** : dans le tableau de bord, journal d'audit, une ligne par envoi avec la bonne action et le bon service.

## Objectif

Fixé avant la vérification, c'est une hypothèse tant qu'elle n'a pas eu lieu : **100 % de conformité sur ChatGPT, Gemini, Claude et Copilot**, les quatre services les plus utilisés. Sur un site non conforme, la correction porte sur l'extraction du prompt ([prompt-extract.ts](../../../apps/agent-browser/src/prompt-extract.ts)) ou l'interception de l'envoi ([page-hook.ts](../../../apps/agent-browser/src/page-hook.ts)), puis la grille est refaite pour ce site.

## Limite

Une grille cochée ne vaut qu'à sa date : les sites changent. En production, il faudrait refaire cette vérification à chaque mise à jour majeure d'un service, ou surveiller dans le journal la part d'envois sans prompt extrait.
