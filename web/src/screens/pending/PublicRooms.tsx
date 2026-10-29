import { Button, Chip } from '../../ui/kit';
import { PENDING_TEXT as T } from '../../texts';

export type PublicRoom = {
  code: string;
  host: string;
  players: number;
  maxPlayers: number;
  map: string;
};

// PublicRooms (maqueta 04-unirse): list of open rooms to join without
// typing a code. Presentational; the parent fetches and joins.
export function PublicRooms(props: {
  rooms: PublicRoom[];
  busy?: boolean;
  onJoin: (code: string) => void;
}) {
  if (props.rooms.length === 0) {
    return <p className="small muted">{T.ROOMS_EMPTY}</p>;
  }
  return (
    <div role="list">
      {props.rooms.map((r) => {
        const full = r.players >= r.maxPlayers;
        return (
          <div
            className="tr room-row"
            role="listitem"
            key={r.code}
            style={{ gridTemplateColumns: '120px 1fr 150px 190px' }}
          >
            <b>{r.code}</b>
            <span>
              {r.host} · <span className="muted">{r.map}</span>
            </span>
            <Chip tone={full ? 'bad' : 'ok'}>
              {T.roomPlayers(r.players, r.maxPlayers)}
            </Chip>
            <Button
              small
              variant="pri"
              disabled={full || props.busy}
              onClick={() => props.onJoin(r.code)}
            >
              {full ? T.ROOM_FULL : T.ROOM_JOIN}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
