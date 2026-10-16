import type { SocketStatus } from '../../net/socket';
import { Icon } from '../../ui/Icon';
import { Chip, Gauge, TitleBar } from '../../ui/kit';
import { CONNECTION_TEXT as T } from '../../texts';

// ConnectionPanel (maqueta 11-conexion): reconectando, match caído o la
// sesión abierta en otra pestaña. Va en la capa del HUD, encima de todo.
export function ConnectionPanel(props: {
  status: SocketStatus;
  matchDown: boolean;
}) {
  const { status } = props;
  if (status.state === 'reconnecting') {
    return (
      <section className="panel conn-panel">
        <TitleBar icon="globe" title={T.RECONNECTING} size={34}>
          <Chip tone="warn">{T.attempt(status.attempt)}</Chip>
        </TitleBar>
        <p>{T.RECONNECTING_TEXT}</p>
        <div className="spin" style={{ margin: '6px 0 16px' }}>
          <i />
          <i />
          <i />
          <i />
        </div>
        <Gauge value={((status.attempt - 1) % 6) / 5} tone="amber" />
      </section>
    );
  }
  if (status.state === 'replaced') {
    return (
      <section className="panel conn-panel">
        <TitleBar icon="user" title={T.REPLACED} size={34} />
        <p>{T.REPLACED_TEXT}</p>
      </section>
    );
  }
  if (props.matchDown) {
    return (
      <section className="panel conn-panel">
        <TitleBar
          icon="warning"
          palette="amber"
          title={T.UNAVAILABLE}
          size={34}
        >
          <Chip tone="bad">match</Chip>
        </TitleBar>
        <p>{T.UNAVAILABLE_TEXT}</p>
        <div className="row" style={{ gap: 16 }}>
          <Icon name="clock" palette="coral" size={30} />
          <div className="spin">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
    );
  }
  return null;
}
