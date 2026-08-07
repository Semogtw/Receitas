import { Link } from 'react-router'
import { useAuth } from './AuthProvider'

export function PendingSetupScreen() {
  const auth = useAuth()
  return (
    <main className="auth-page"><section className="auth-panel" aria-labelledby="pending-title">
      <h1 id="pending-title">Concluir acesso</h1>
      <p className="auth-copy">Esta identidade existe, mas o vínculo com o caderno ainda não foi concluído. Abra o convite mais recente recebido por e-mail.</p>
      <p>Se o primeiro convite expirou, use <Link to="/setup">Configuração inicial</Link>. Para a segunda pessoa, o membro já ativo deve emitir um novo convite.</p>
      <button className="button button--quiet" type="button" onClick={() => void auth.signOut()}>Sair desta sessão</button>
    </section></main>
  )
}
