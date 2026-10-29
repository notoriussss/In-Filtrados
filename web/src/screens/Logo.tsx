import { Chip } from '../ui/kit';
import { APP_TEXT } from '../texts';

// Logo de las maquetas: «In-» verde, «Filtrados» aqua y las 3R.
export function Logo(props: { centered?: boolean }) {
  return (
    <div className={props.centered ? 'logo c' : 'logo'}>
      <h1>
        <span className="a">{APP_TEXT.TITLE_A}</span>
        <span className="b">{APP_TEXT.TITLE_B}</span>
      </h1>
      <div className="sub">
        <Chip tone="ok" big icon="tap">
          {APP_TEXT.REDUCE}
        </Chip>
        <Chip tone="warn" big icon="bucket">
          {APP_TEXT.REUSE}
        </Chip>
        <Chip tone="info" big icon="filter">
          {APP_TEXT.RECYCLE}
        </Chip>
      </div>
    </div>
  );
}
