# Checklist qualité avant mise en production

## Code
- [ ] Revue de code faite par un second développeur
- [ ] Aucune alerte bloquante de l'analyse statique
- [ ] Dépendances à jour et sans vulnérabilité critique connue

## Tests
- [ ] Tests unitaires verts
- [ ] Tests de bout en bout sur l'environnement de recette
- [ ] Test de charge sur les écrans les plus utilisés

## Sécurité
- [ ] Aucun secret dans le dépôt (variables d'environnement uniquement)
- [ ] Journalisation sans données personnelles
- [ ] Droits d'accès vérifiés par profil

## Exploitation
- [ ] Procédure de retour arrière rédigée et testée
- [ ] Sauvegarde vérifiée avant la mise en production
- [ ] Supervision et alertes configurées

## Documentation
- [ ] Notes de version publiées
- [ ] Guide utilisateur mis à jour
- [ ] Équipe support informée

Aucun identifiant ni secret dans ce fichier.
