# Scénarios de tests E2E — fonctionnalité texte

Catalogue de validation bout-en-bout du chemin **prompt texte** (périmètre prototype DAT) :
détection → score de risque → politique ALLOW/WARN/MASK/BLOCK → masquage → journalisation sans clair.

Les scénarios automatisés (`packages/agent-runtime/src/e2e-texte.*`) couvrent le **pipeline local** partagé par A1, A2 et Inspect.
Les scénarios manuels ci-dessous valident l’interception réelle navigateur / CLI et le Dashboard.

---

## 0. Prérequis

| Élément | État attendu |
|---|---|
| Stack locale | `pnpm dev` → API `:4000`, Dashboard `:3000` |
| Base | `pnpm db:migrate` + `pnpm db:seed` |
| Comptes | `marie.agbodji@cnss.bj` / `User!2026` (USER Cotisations) · `rssi@cnss.bj` / `Admin!2026` |
| Agents | `pnpm agents:build` · A1 chargé depuis `apps/agent-browser/dist` · A2 enrôlé |
| Suite auto | `pnpm test:e2e:texte` |

**Périmètre** : texte uniquement (pièces jointes hors scope — limite assumée DAT).

---

## 1. Matrice de couverture

| ID | Groupe | Canal | Décision cible | Auto | Manuel |
|---|---|---|---|---|---|
| T-ALLOW-01/02 | ALLOW | browser / cli | ALLOW | ✔ | A1 / A2 |
| T-BLOCK-01…04 | BLOCK | browser / cli | BLOCK (secret / médical) | ✔ | A1 / A2 |
| T-MASK-01…05 | MASK | browser / cli | MASK (CNSS, finance, QI) | ✔ | A1 / Inspect |
| T-WARN-01 | WARN | browser | WARN (ou ALLOW) | ✔ | Inspect |
| T-CH-01…03 | Canaux | cli / browser / DeepSeek | même logique | ✔ | A1 / A2 |
| T-MSK-INT-01 | Masquage | browser | jetons + contexte | ✔ | A1 |
| T-INV-01…04 | Invariants | — | priorité politiques | ✔ | — |
| M-A1-01…06 | Extension | browser | interception UI / fetch | | ✔ |
| M-A2-01…04 | Shim CLI | cli | wrappers + démon | | ✔ |
| M-INS-01…03 | Inspect | api | pipeline serveur | | ✔ |
| M-OFF-01…03 | Hors-ligne | local | file + sync | | ✔ |
| M-AUD-01…03 | Audit | dashboard | journal sans clair | | ✔ |
| M-NEG-01…04 | Négatifs | divers | non-régression | | ✔ |

---

## 2. Scénarios automatisés (pipeline)

Fichiers : `packages/agent-runtime/src/e2e-texte.scenarios.ts` · `e2e-texte.test.ts`  
Politiques : copie fidèle du seed (`SEED_EQUIVALENT_POLICIES`).

Exécution :

```powershell
pnpm test:e2e:texte
```

### Critères de succès communs

1. `action ∈ expectedActions`
2. Entités attendues présentes (`expectEntityTypes`)
3. Si **MASK** : le clair listé dans `mustNotAppearIfMasked` a disparu ; un jeton `*_NNN` apparaît ; le contexte métier (ex. « cotisations ») reste
4. Si **BLOCK** : le texte n’est pas modifié côté agent (envoi interdit)
5. Si **ALLOW** : aucun secret technique détecté

Référence détaillée des prompts : voir `TEXT_E2E_SCENARIOS` dans `scenarios.ts` (IDs `T-*`).

---

## 3. Scénarios manuels — Extension A1 (navigateur)

**Setup** : Dashboard → Agents → émettre jeton (Extension + Terminal) pour Marie → enrôler A1 → autoriser sites catalogue → ouvrir ChatGPT (ou Claude / Gemini).

### M-A1-01 — ALLOW visible

| | |
|---|---|
| **Prompt** | `Explique-moi en trois points le rôle d'une caisse de sécurité sociale.` |
| **Action** | Saisir dans le composer → Entrée ou Envoyer |
| **Attendu** | Pas de bannière BLOCK/MASK ; le message part ; événement ALLOW (ou rien de bloquant) dans Dashboard → Événements |
| **Échec si** | Bannière rouge / envoi empêché |

### M-A1-02 — BLOCK clé API

| | |
|---|---|
| **Prompt** | `Voici ma clé sk-abcdefghijklmnopqrstuvwxyz012345, configure mon client.` |
| **Attendu** | Bannière BLOCK ; message **non envoyé** ; overlay avec message utilisateur ; événement `BLOCK` + politique « secrets » |
| **Échec si** | Le prompt clair apparaît dans l’historique ChatGPT |

### M-A1-03 — MASK CNSS + renvoi automatique

| | |
|---|---|
| **Prompt** | `Le n° assuré CNSS A12345678 a un impayé. Rédige un rappel.` |
| **Attendu** | Bannière MASK ; le composer / la requête part avec un jeton (`NUM_ASSURE_001` ou équivalent) ; **pas** de `A12345678` dans le réseau (DevTools → Network) |
| **Échec si** | Second envoi manuel requis, ou clair visible dans le payload |

### M-A1-04 — Interception fetch (pas seulement le bouton)

| | |
|---|---|
| **Action** | Sur un site catalogue, déclencher l’envoi via raccourci / bouton de façon à passer par `fetch` JSON conversation |
| **Attendu** | Même décision que M-A1-02/03 pour les prompts correspondants |
| **Échec si** | Seul le clic DOM est couvert, le fetch passe sans analyse |

### M-A1-05 — Domaine catalogue dynamique (DeepSeek)

| | |
|---|---|
| **Action** | Popup A1 → Autoriser sites catalogue → ouvrir `chat.deepseek.com` → coller prompt T-MASK-01 |
| **Attendu** | Interception active sans rebuild de l’extension |
| **Échec si** | Aucune interception sur DeepSeek après autorisation |

### M-A1-06 — Entrée clavier

| | |
|---|---|
| **Action** | Prompt BLOCK (M-A1-02) puis touche Entrée (sans clic Envoyer) |
| **Attendu** | BLOCK comme au clic |
| **Échec si** | Entrée bypasse l’agent |

---

## 4. Scénarios manuels — Shim A2 (CLI)

**Setup** : même jeton → `node apps/agent-cli/dist/cli.js enroll ...` → PATH `~\.acg\bin` → démon actif (`daemon` / `status`).

### M-A2-01 — ALLOW CLI

```powershell
claude "Explique la différence entre REST et GraphQL en cinq lignes."
```

| **Attendu** | Commande s’exécute ; pas d’erreur ACG exit 2 ; éventuel journal ALLOW |
| **Échec si** | Exit code 2 ou message BLOCK sans raison |

### M-A2-02 — BLOCK secret

```powershell
claude "Ma clé OpenAI sk-abcdefghijklmnopqrstuvwxyz012345"
```

| **Attendu** | Message `[ACG]` / erreur ; `exit code 2` ; **pas** d’appel réel avec la clé ; événement BLOCK |
| **Échec si** | La CLI enfant démarre avec la clé en clair dans argv transmis |

### M-A2-03 — MASK réécrit l’argument

```powershell
claude "Le n° assuré CNSS A12345678 a un impayé."
```

| **Attendu** | `[ACG MASK]` sur stderr ; argv réécrit avec jeton ; démon heartbeat intact (pas de collision de séquence) |
| **Échec si** | Heartbeat en erreur après intercept, ou clair toujours dans la commande enfant |

### M-A2-04 — Wrapper installé pour chaque commande catalogue

| **Action** | `Get-ChildItem $env:USERPROFILE\.acg\bin` |
| **Attendu** | Wrappers présents (`claude`, `codex`, `gemini`, … selon catalogue) |
| **Échec si** | Commande catalogue absente après enroll / `install` |

---

## 5. Scénarios manuels — Inspect (Dashboard)

Connexion RSSI → page **Inspection d’un prompt**.

### M-INS-01 — Pipeline serveur aligné seed

| **Texte** | Prompt par défaut de la page (cotisations + CNSS + MoMo) |
| **Service** | `chatgpt.com` |
| **Attendu** | Décision MASK ou BLOCK ; jauge de score ; facteurs détaillés ; nom de politique non vide |
| **Échec si** | Erreur API, ou ALLOW sur un prompt aussi riche |

### M-INS-02 — Secret → BLOCK

| **Texte** | `password = Admin!2026 pour le serveur de prod` |
| **Attendu** | BLOCK · politique secrets |
| **Échec si** | WARN/ALLOW |

### M-INS-03 — Texte sain → ALLOW

| **Texte** | `Quelles sont les étapes d'une analyse SWOT ?` |
| **Attendu** | ALLOW · score bas · message cohérent |
| **Échec si** | Faux positif BLOCK/MASK |

---

## 6. Scénarios hors-ligne / résilience

### M-OFF-01 — Décision locale API coupée

| **Action** | Arrêter l’API (`:4000`) · envoyer via A1 un prompt MASK (CNSS) |
| **Attendu** | Décision locale toujours appliquée (MASK/BLOCK) ; interaction mise en **file** agent |
| **Échec si** | Prompt clair envoyé faute de serveur, ou UI plantée |

### M-OFF-02 — Retransmission file

| **Action** | Relancer l’API · attendre heartbeat / `tick` A1 ou démon A2 |
| **Attendu** | Événements de la file apparaissent dans Dashboard ; **sans** clair |
| **Échec si** | File perdue ou payload avec valeurs en clair côté analytics |

### M-OFF-03 — Fail-closed Cotisations dégradé

| **Contexte** | Agent Marie (direction Cotisations) · couches NER/LLM indisponibles (mode dégradé) |
| **Prompt** | Texte ambigu sans motif règles fort |
| **Attendu** | BLOCK (politique fail-closed ou garde-fou pipeline) |
| **Échec si** | ALLOW en direction high + détection dégradée |

---

## 7. Scénarios audit Dashboard

### M-AUD-01 — Événement sans clair

| **Action** | Après M-A1-03, ouvrir Événements / détail |
| **Attendu** | Types d’entités, score, action, frameworks ; **aucune** valeur `A12345678` / e-mail / IBAN en clair |
| **Échec si** | Valeur sensible affichée ou export CSV |

### M-AUD-02 — Chaînage / traçabilité

| **Action** | Enchaîner 3 prompts (ALLOW, MASK, BLOCK) |
| **Attendu** | 3 lignes distinctes, actions correctes, utilisateur / service renseignés |
| **Échec si** | Événements fusionnés ou agentId manquant |

### M-AUD-03 — Overview KPI

| **Action** | Overview après la campagne de tests |
| **Attendu** | Compteurs ALLOW/WARN/MASK/BLOCK cohérents avec les essais |
| **Échec si** | Compteurs à zéro alors que des événements existent |

---

## 8. Scénarios négatifs / non-régression

### M-NEG-01 — Faux motif IBAN

| **Texte** | `Le code produit FR76-DEMO-XXXX n'est pas un IBAN.` |
| **Attendu** | Pas de détection IBAN valide (validateur) → pas de MASK « finance IBAN » pour cette seule raison |
| **Échec si** | IBAN invalidé traité comme vrai |

### M-NEG-02 — API locale non interceptée

| **Action** | Depuis une page catalogue, un `fetch` vers `http://localhost:4000/...` |
| **Attendu** | Non traité comme appel modèle (`looksLikeModelCall` exclut `:4000`) |
| **Échec si** | Boucle d’évaluation / blocage de l’API ACG |

### M-NEG-03 — Prompt vide / espaces

| **Action** | Envoyer uniquement des espaces |
| **Attendu** | Pas de crash agent ; pas d’événement parasite critique |
| **Échec si** | Exception non gérée dans content script / CLI |

### M-NEG-04 — Priorité BLOCK > MASK > WARN

| **Texte** | Contient à la fois `sk-abc...` **et** un n° CNSS |
| **Attendu** | **BLOCK** (priority secrets = 1), pas MASK |
| **Échec si** | MASK appliqué et envoi partiel |

---

## 9. Procédure de campagne (ordre recommandé)

1. `pnpm test:e2e:texte` — doit être **vert** avant les manuels  
2. Inspect : M-INS-01 → 03  
3. A1 : M-A1-01 → 06  
4. A2 : M-A2-01 → 04  
5. Hors-ligne : M-OFF-01 → 02  
6. Audit : M-AUD-01 → 03  
7. Négatifs : M-NEG-01 → 04  

### Critère de clôture « sans faille »

- [ ] Suite auto 100 % verte  
- [ ] Aucun clair sensible observé dans Network / argv / Dashboard sur les cas MASK/BLOCK  
- [ ] BLOCK empêche réellement l’envoi (A1 + A2)  
- [ ] MASK réécrit automatiquement le prompt (A1) / argv (A2)  
- [ ] File hors-ligne rejouée sans perte  
- [ ] Aucune régression M-NEG  

---

## 10. Traçabilité DAT

| Exigence | Scénarios |
|---|---|
| FR-01 interception navigateur | M-A1-* |
| FR-02 interception CLI | M-A2-* |
| FR-03 détection catégories | T-BLOCK-* · T-MASK-* · auto |
| FR-04 score de risque | M-INS-* · facteurs |
| FR-05 quasi-identifiants | T-MASK-04 |
| FR-06 politiques | T-* · seed policies |
| FR-07 anonymisation MASK | T-MASK-* · M-A1-03 · M-A2-03 |
| FR-08 journal sans clair | M-AUD-01 · M-OFF-02 |
| NFR-02 mode déconnecté | M-OFF-* |
| NFR-01 latence (contrôle manuel) | Chronométrer M-INS-01 / M-A1-03 (< 300 ms P95 cible texte) |
