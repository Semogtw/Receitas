import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectUiIntegration } from './ui-integration-audit.mjs'

const SAFE = {
  router: `
import { ReplacementCompletionScreen } from '../features/auth/ReplacementCompletionScreen'
const routes = [
  { path: '/auth/finish-replacement', Component: ReplacementCompletionScreen },
  { path: '/', element: <AuthGate><AppShell /></AuthGate> },
]
`,
  settings: `
<CompleteRestorePanel database={database} />
<ReplaceRestorePanel database={database} />
<AccountAdminScreen database={database} />
<TrashPanel database={database} />
`,
  main: `
import './styles/cooking.css'
import './styles/media.css'
import './styles/account-admin.css'
`,
  recipesRoute: `
const mediaRuntime = createBrowserMediaRuntime(database, {
  pairId: auth.pairId,
  actorUserId: auth.userId,
})
useMediaUploadSync(mediaRuntime)
<RecipePhotosPanel runtime={mediaRuntime} />
<OfflineRecipeAvailability runtime={mediaRuntime} />
<CookingWorkspace mediaRuntime={mediaRuntime} />
`,
  recipeDetail: `
interface Props { onCook?: () => void }
<button onClick={onCook}>Cozinhar agora</button>
`,
  cookingWorkspace: `
<CookingSessionPhotosPanel runtime={mediaRuntime} />
`,
}

test('accepts the release-critical restore, recovery, cooking and media integration', () => {
  assert.deepEqual(inspectUiIntegration(SAFE), [])
})

test('rejects replacement completion placed behind AuthGate', () => {
  const router = `
const routes = [
  { path: '/', element: <AuthGate><AppShell /></AuthGate> },
  { path: '/auth/finish-replacement', Component: ReplacementCompletionScreen },
]
`
  const findings = inspectUiIntegration({ ...SAFE, router })
  assert(findings.some((finding) => finding.includes('outside AuthGate')))
})

test('rejects restore, trash or account recovery components becoming unreachable', () => {
  const findings = inspectUiIntegration({ ...SAFE, settings: '<CompleteRestorePanel database={database} />' })
  assert(findings.some((finding) => finding.includes('ReplaceRestorePanel')))
  assert(findings.some((finding) => finding.includes('AccountAdminScreen')))
  assert(findings.some((finding) => finding.includes('TrashPanel')))
})

test('rejects release-critical styles disappearing from the bundle', () => {
  const findings = inspectUiIntegration({ ...SAFE, main: "import './styles/cooking.css'" })
  assert(findings.some((finding) => finding.includes('./styles/media.css')))
  assert(findings.some((finding) => finding.includes('./styles/account-admin.css')))
})

test('rejects recipe media or cooking surfaces becoming unreachable again', () => {
  const findings = inspectUiIntegration({
    ...SAFE,
    recipesRoute: '<CookingWorkspace />',
    recipeDetail: '<button>Editar receita</button>',
    cookingWorkspace: '<CookingHistory />',
  })
  assert(findings.some((finding) => finding.includes('RecipePhotosPanel')))
  assert(findings.some((finding) => finding.includes('OfflineRecipeAvailability')))
  assert(findings.some((finding) => finding.includes('shared media runtime')))
  assert(findings.some((finding) => finding.includes('reconnect drain')))
  assert(findings.some((finding) => finding.includes('full authenticated pair scope')))
  assert(findings.some((finding) => finding.includes('cooking mode action')))
  assert(findings.some((finding) => finding.includes('session photo capture')))
})

test('rejects actor-only media runtime construction even when media surfaces remain mounted', () => {
  const findings = inspectUiIntegration({
    ...SAFE,
    recipesRoute: `
const mediaRuntime = createBrowserMediaRuntime(database, auth.userId)
useMediaUploadSync(mediaRuntime)
<RecipePhotosPanel runtime={mediaRuntime} />
<OfflineRecipeAvailability runtime={mediaRuntime} />
<CookingWorkspace mediaRuntime={mediaRuntime} />
`,
  })
  assert(findings.some((finding) => finding.includes('full authenticated pair scope')))
})
