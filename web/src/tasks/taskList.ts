import type { Snapshot } from '@in-filtrados/messages';
import { gameMap } from '../map';
import { STATION_COLORS } from '../canvas/renderMap';
import { TASK_TEXT } from '../constants';
import { buildTaskList } from './tasks';

// S2-11: lista de misiones en la esquina superior izquierda. Solo se
// reescribe cuando cambia algo, no en cada snapshot.

export type TaskListPanel = {
  update(snap: Snapshot): void;
  hide(): void;
};

export function mountTaskList(root: HTMLElement): TaskListPanel {
  let lastKey = '';

  const render = (snap: Snapshot) => {
    const rows = buildTaskList(snap.myTasks, gameMap);
    const done = rows.filter((r) => r.done).length;
    root.replaceChildren();

    const title = document.createElement('h3');
    title.textContent = TASK_TEXT.LIST_TITLE(done, rows.length);
    root.append(title);

    const list = document.createElement('ul');
    for (const row of rows) {
      const item = document.createElement('li');
      item.className = row.done ? 'task-row task-done' : 'task-row';
      const dot = document.createElement('span');
      dot.className = 'task-dot';
      dot.style.background = STATION_COLORS[row.type];
      const text = document.createElement('span');
      text.textContent = TASK_TEXT.ROW(
        TASK_TEXT.TYPE_NAMES[row.type],
        row.zoneName ?? TASK_TEXT.UNKNOWN_ZONE,
      );
      item.append(dot, text);
      list.append(item);
    }
    root.append(list);

    if (rows.length > 0 && done === rows.length) {
      const all = document.createElement('p');
      all.className = 'task-all-done';
      all.textContent = TASK_TEXT.ALL_DONE;
      root.append(all);
    }
  };

  return {
    update(snap) {
      const visible = snap.phase === 'PLAYING' && snap.myTasks.length > 0;
      root.hidden = !visible;
      if (!visible) return;
      const key = JSON.stringify(snap.myTasks);
      if (key === lastKey) return;
      lastKey = key;
      render(snap);
    },
    hide() {
      root.hidden = true;
      lastKey = '';
    },
  };
}
