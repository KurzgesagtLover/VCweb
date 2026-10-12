import { requireSession } from "@/src/auth/session";
import { getViewerContext } from "@/src/db/queries/viewer";
import { getWorldMechanicBoard } from "@/src/services/world-mechanics";
import { TnoReadout, TnoWindow } from "@/src/ui/tno-frame";
import { WorldMechanicsView } from "@/src/ui/world-mechanics-view";

export const metadata = { title: "세계 정세" };

export default async function WorldStatePage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const board = await getWorldMechanicBoard({
    campaign: context.campaign,
    country: context.country,
    turn: context.turn,
  });
  return (
    <TnoWindow
      title="세계 정세"
      readout={
        <>
          <TnoReadout label="국가" value={context.country?.name ?? "—"} />
          <TnoReadout
            label="정치력"
            value={board.balance === null ? "—" : Number(board.balance).toFixed(1)}
          />
        </>
      }
    >
      <WorldMechanicsView
        board={board}
        canAct={session.user.role === "PLAYER" && Boolean(context.country)}
      />
    </TnoWindow>
  );
}
