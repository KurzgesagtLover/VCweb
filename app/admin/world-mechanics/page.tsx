import { setWorldMechanicProgressAction } from "@/src/actions/world-mechanics";
import { requireRole } from "@/src/auth/session";
import { getViewerContext } from "@/src/db/queries/viewer";
import { getWorldMechanicBoard } from "@/src/services/world-mechanics";
import { TnoPlate, TnoWindow } from "@/src/ui/tno-frame";
import { WorldMechanicsView } from "@/src/ui/world-mechanics-view";

export const metadata = { title: "세계 메커니즘" };

export default async function AdminWorldMechanicsPage() {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return <p>활성 캠페인이 없습니다.</p>;
  const board = await getWorldMechanicBoard({
    campaign: context.campaign,
    country: null,
    turn: context.turn,
  });
  return (
    <TnoWindow title="세계 메커니즘 관리">
      <TnoPlate title="진행도 직접 조정" wide>
        {board.mechanics.map(({ definition, progress }) => (
          <form
            key={definition.key}
            action={setWorldMechanicProgressAction}
            className="admin-inline-form"
          >
            <input type="hidden" name="mechanicKey" value={definition.key} />
            <label>
              {definition.label} ({definition.min}~{definition.max})
              <input
                type="number"
                name="progress"
                step="0.1"
                min={definition.min}
                max={definition.max}
                defaultValue={progress}
                required
              />
            </label>
            <label>
              사유
              <input type="text" name="reason" minLength={3} maxLength={1000} required />
            </label>
            <button type="submit">적용</button>
          </form>
        ))}
      </TnoPlate>
      <WorldMechanicsView board={board} canAct={false} />
    </TnoWindow>
  );
}
