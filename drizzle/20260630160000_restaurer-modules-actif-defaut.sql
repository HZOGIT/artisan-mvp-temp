/**
 * Restaure les modules actif_par_defaut incorrectement désactivés (régression OPE-850).
 * Cause : changePlan(downgrade→starter) appelait deactivateLockedModules mais l'upgrade
 * suivant ne réactivait pas les modules — laissant les comptes enterprise sans modules pro.
 * Fix : réactive les modules actif_par_defaut compatibles avec le plan courant de chaque artisan.
 * artisan_modules est FORCE ROW LEVEL SECURITY → boucle PL/pgSQL avec set_config par artisan.
 */
DO $$
DECLARE
  _artisan_id integer;
  _plan_id text;
  _valid_mins text[];
BEGIN
  FOR _artisan_id, _plan_id IN
    SELECT artisan_id, plan_id
    FROM billing_subscriptions
    WHERE status IN ('active', 'trialing')
  LOOP
    _valid_mins := CASE _plan_id
      WHEN 'enterprise' THEN ARRAY['essentiel', 'pro', 'entreprise']
      WHEN 'pro'        THEN ARRAY['essentiel', 'pro']
      ELSE                   ARRAY['essentiel']
    END;

    PERFORM set_config('app.tenant', _artisan_id::text, false);

    INSERT INTO artisan_modules (artisan_id, module_slug, actif)
    SELECT _artisan_id, m.slug, true
    FROM modules m
    WHERE m.actif_par_defaut = true
      AND m.plan_minimum = ANY(_valid_mins)
    ON CONFLICT (artisan_id, module_slug) DO UPDATE
      SET actif = true
      WHERE artisan_modules.actif = false;
  END LOOP;

  PERFORM set_config('app.tenant', '', false);
END $$;
