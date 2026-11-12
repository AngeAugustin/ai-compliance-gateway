# Extension sur les vrais services d'IA

Date : 12/11/2026 · vérification manuelle selon [protocole.md](../sites-reels/protocole.md) · données fictives uniquement · Chrome, extension compilée depuis `apps/agent-browser/dist`.

## Grille

| Site | P1 Entrée | P1 bouton | P2 Entrée | P2 bouton | P3 masqué | P3 panneau | P4 fichiers | Journal |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| chatgpt.com | ✅ | ✅ | ✅ | ✅ | ✅ (P3 corrigé) | ✅ | ✅ | ✅ vérifié en base |
| gemini.google.com | ✅ | ✅ | ✅ | ✅ | ✅ (P3 corrigé) | ✅ | ✅ | ✅ relevé opérateur |
| claude.ai | ✅ | ✅ | ✅ | ✅ | ✅ (P3 corrigé) | ✅ | ✅ | ✅ relevé opérateur |
| copilot.microsoft.com | ✅ | ✅ | ✅ | ✅ | ✅ (P3 corrigé) | ✅ | ✅ | ✅ relevé opérateur |
| chat.mistral.ai | ✅ | ✅ | ✅ | ✅ | ✅ (P3 corrigé) | ✅ | ✅ | ✅ relevé opérateur |
| chat.deepseek.com | ✅ | ✅ | ✅ | ✅ | ✅ (P3 corrigé) | ✅ | ✅ | ✅ relevé opérateur |
| www.perplexity.ai | ✅ | ✅ | ✅ | ✅ | ✅ (P3 corrigé) | ✅ | ✅ | ✅ relevé opérateur |
| grok.com | ✅ | ✅ | ✅ | ✅ | ✅ (P3 corrigé) | ✅ | ✅ | ✅ relevé opérateur |

- **Journal vérifié en base** : pour chatgpt.com, les décisions figurent dans le journal d'audit de la base de démonstration (ALLOW, BLOCK, MASK, aux heures des tests).
- **Bannière** : constatée à l'écran par l'opérateur, après correction de l'extension (constat 2), sur les 8 sites.
- **Relevé opérateur** : les autres sites ont été testés sur d'autres postes, rattachés à d'autres instances de l'API ; le résultat est celui noté par l'opérateur, il n'a pas été recoupé avec un journal.

## Constats

1. **Résultat attendu de P3 erroné (protocole).** La première version de P3 ne contenait qu'une adresse e-mail. Le serveur l'a jugée à risque modéré (40 à 42) et aucune politique livrée ne masque une adresse seule : décision ALLOW, prompt envoyé en clair, conformément à la décision. P3 contient désormais un numéro d'assuré (politique « Identifiants CNSS »). Sur chatgpt.com, P3 corrigé est masqué : journal MASK (numéro d'assuré et e-mail), le service ne reçoit que `NUM_ASSURE_001` et `EMAIL_001`, les valeurs s'affichent dans le panneau local de l'extension.
2. **Masquage sans bannière (défaut corrigé).** Sur le vrai ChatGPT, l'envoi est intercepté au niveau de la requête de la page (page-hook) et non par la touche Entrée ou le bouton. Ce chemin masquait le prompt sans afficher la bannière « Données sensibles remplacées par des jetons ». Correctif : [content.ts](../../../apps/agent-browser/src/content.ts) affiche la bannière pour MASK, BLOCK et WARN sur ce chemin aussi. Test ajouté : [extension.e2e.ts](../../../apps/agent-browser/e2e/extension.e2e.ts), « envoi masqué par le page-hook : l'utilisateur voit la bannière MASK » (11/11).
3. **Décisions ALLOW contenant l’e-mail juste avant un MASK** (07:46:56 à 07:47:06) : envois intermédiaires de l’opérateur avec des variantes du prompt sans numéro d’assuré, pas un brouillon envoyé par le site.
4. **Choix de politique à discuter.** Une adresse e-mail seule part en clair. C'est conforme aux politiques livrées, mais le RSSI et le DPO peuvent souhaiter la masquer.

## Bilan

Avec l'extension corrigée, les 4 prompts sont conformes sur les **8 sites** (Entrée et bouton, masquage avec panneau et bannière, fichiers, journal) : objectif atteint pour ChatGPT, Gemini, Claude et Copilot, et au-delà. Seul chatgpt.com est recoupé avec le journal en base (P3 corrigé : MASK à 07:42, 07:47 et 07:49) ; les 7 autres sites relèvent du relevé de l'opérateur sur d'autres postes.
