import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function inspectUiIntegration({ router, settings, main, recipesRoute = '', recipeDetail = '', cookingWorkspace = '' }) {
  const findings = []

  const replacementPathIndex = router.indexOf("path: '/auth/finish-replacement'")
  const authGateIndex = router.indexOf('element: <AuthGate>')
  if (replacementPathIndex < 0 || !router.includes('ReplacementCompletionScreen')) {
    findings.push('replacement completion screen must be routed at /auth/finish-replacement')
  } else if (authGateIndex >= 0 && replacementPathIndex > authGateIndex) {
    findings.push('replacement completion route must remain outside AuthGate')
  }

  for (const component of ['CompleteRestorePanel', 'ReplaceRestorePanel', 'AccountAdminScreen', 'TrashPanel']) {
    if (!settings.includes(`<${component}`)) findings.push(`${component} must remain reachable from SettingsRoute`)
  }

  for (const stylesheet of ['./styles/cooking.css', './styles/media.css', './styles/account-admin.css']) {
    if (!main.includes(`import '${stylesheet}'`)) findings.push(`${stylesheet} must remain included in the application bundle`)
  }

  if (recipesRoute) {
    for (const component of ['RecipePhotosPanel', 'OfflineRecipeAvailability']) {
      if (!recipesRoute.includes(`<${component}`)) findings.push(`${component} must remain reachable from recipe detail`)
    }
    if (!recipesRoute.includes('mediaRuntime={mediaRuntime')) {
      findings.push('CookingWorkspace must receive the shared media runtime')
    }
    if (!recipesRoute.includes('useMediaUploadSync(mediaRuntime)')) {
      findings.push('recipe route must keep the durable media reconnect drain mounted')
    }
    if (
      !recipesRoute.includes('createBrowserMediaRuntime(database, {') ||
      !recipesRoute.includes('pairId: auth.pairId') ||
      !recipesRoute.includes('actorUserId: auth.userId') ||
      recipesRoute.includes('createBrowserMediaRuntime(database, auth.userId)')
    ) {
      findings.push('browser media runtime must be created with the full authenticated pair scope')
    }
  }

  if (recipeDetail && (!recipeDetail.includes('Cozinhar agora') || !recipeDetail.includes('onCook'))) {
    findings.push('recipe detail must keep an explicit cooking mode action')
  }

  if (cookingWorkspace && !cookingWorkspace.includes('<CookingSessionPhotosPanel')) {
    findings.push('finished cooking flow must keep session photo capture reachable')
  }

  return findings
}

export async function auditUiIntegration(root = process.cwd()) {
  const [router, settings, main, recipesRoute, recipeDetail, cookingWorkspace] = await Promise.all([
    readFile(join(root, 'src', 'app', 'router.tsx'), 'utf8').catch(() => ''),
    readFile(join(root, 'src', 'app', 'routes', 'SettingsRoute.tsx'), 'utf8').catch(() => ''),
    readFile(join(root, 'src', 'main.tsx'), 'utf8').catch(() => ''),
    readFile(join(root, 'src', 'app', 'routes', 'RecipesRoute.tsx'), 'utf8').catch(() => ''),
    readFile(join(root, 'src', 'features', 'recipes', 'components', 'RecipeDetail.tsx'), 'utf8').catch(() => ''),
    readFile(join(root, 'src', 'features', 'cooking', 'components', 'CookingWorkspace.tsx'), 'utf8').catch(() => ''),
  ])

  return inspectUiIntegration({ router, settings, main, recipesRoute, recipeDetail, cookingWorkspace })
}

export async function runUiIntegrationAudit(root = process.cwd()) {
  const findings = await auditUiIntegration(root)
  if (findings.length > 0) throw new Error(`UI integration audit failed:\n- ${findings.join('\n- ')}`)
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runUiIntegrationAudit()
    .then(() => console.log('UI integration audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
