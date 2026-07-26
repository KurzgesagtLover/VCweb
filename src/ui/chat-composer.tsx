"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendChatMessageAction, type ChatFormState } from "@/src/actions/chat";

export function ChatComposer({ channelId, replyToId }: { channelId: string; replyToId?: string }) {
  const [state, action, pending] = useActionState<ChatFormState, FormData>(
    sendChatMessageAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form action={action} className="chat-composer" id="message-composer" ref={formRef}>
      <input type="hidden" name="channelId" value={channelId} />
      <input type="hidden" name="replyToId" value={replyToId ?? ""} />
      <label htmlFor="chat-body">{replyToId ? "답글" : "메시지"}</label>
      <div>
        <textarea
          id="chat-body"
          name="body"
          maxLength={1200}
          rows={3}
          required
          placeholder="메시지를 입력하세요"
        />
        <button disabled={pending}>{pending ? "전송 중…" : "보내기"}</button>
      </div>
      {state.error && (
        <p className="form-message" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="sr-only" role="status">
          {state.success}
        </p>
      )}
    </form>
  );
}
