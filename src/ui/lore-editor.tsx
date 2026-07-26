"use client";

import { useEffect, useRef, useState } from "react";
import { saveCampaignLoreAction } from "@/src/actions/campaign";
import { LoreFrame } from "./lore-frame";

export function LoreEditor({
  initialHtml,
  initialCss,
}: {
  initialHtml: string;
  initialCss: string;
}) {
  const [html, setHtml] = useState(initialHtml);
  const [css, setCss] = useState(initialCss);
  const [activeSource, setActiveSource] = useState<"visual" | "html" | "css">("visual");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [hasSelectedImage, setHasSelectedImage] = useState(false);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const htmlValueRef = useRef(initialHtml);

  useEffect(() => {
    htmlValueRef.current = html;
  }, [html]);

  useEffect(() => {
    const editor = visualRef.current;
    const currentHtml = htmlValueRef.current;
    if (activeSource === "visual" && editor && editor.innerHTML !== currentHtml) {
      selectImage(null);
      editor.innerHTML = currentHtml;
    }
  }, [activeSource]);

  function rememberSelection() {
    const editor = visualRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
    selectionRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const editor = visualRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    const saved = selectionRef.current;
    if (saved && editor.contains(saved.commonAncestorContainer)) {
      selection.addRange(saved);
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.addRange(range);
  }

  function syncVisualHtml() {
    const editor = visualRef.current;
    if (!editor) return;
    const selectedImage = selectedImageRef.current;
    selectedImage?.removeAttribute("data-editor-selected");
    setHtml(editor.innerHTML);
    selectedImage?.setAttribute("data-editor-selected", "true");
  }

  function runEditorCommand(command: string, value?: string) {
    restoreSelection();
    document.execCommand(command, false, value);
    syncVisualHtml();
    rememberSelection();
  }

  function escapeAttribute(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function insertLink() {
    rememberSelection();
    const url = window.prompt("연결할 주소를 입력하세요.", "https://");
    if (!url) return;
    restoreSelection();
    const selection = window.getSelection();
    if (selection?.isCollapsed) {
      const label = window.prompt("링크에 표시할 글자를 입력하세요.", url) || url;
      document.execCommand(
        "insertHTML",
        false,
        `<a href="${escapeAttribute(url)}">${escapeAttribute(label)}</a>`,
      );
    } else {
      document.execCommand("createLink", false, url);
    }
    syncVisualHtml();
    rememberSelection();
  }

  function insertHtml(markup: string) {
    restoreSelection();
    document.execCommand("insertHTML", false, markup);
    syncVisualHtml();
    rememberSelection();
  }

  function insertTable() {
    insertHtml(
      '<table class="wiki-table"><thead><tr><th>항목</th><th>내용</th></tr></thead><tbody><tr><td>항목 1</td><td>내용을 입력하세요.</td></tr><tr><td>항목 2</td><td>내용을 입력하세요.</td></tr></tbody></table><p><br></p>',
    );
  }

  function insertCallout() {
    insertHtml(
      '<aside class="wiki-callout"><strong>안내</strong><p>강조할 내용을 입력하세요.</p></aside><p><br></p>',
    );
  }

  function insertCodeBlock() {
    insertHtml('<pre class="wiki-code-block"><code>내용을 입력하세요.</code></pre><p><br></p>');
  }

  function selectImage(image: HTMLImageElement | null) {
    selectedImageRef.current?.removeAttribute("data-editor-selected");
    selectedImageRef.current = image;
    image?.setAttribute("data-editor-selected", "true");
    setHasSelectedImage(Boolean(image));
  }

  function updateSelectedImage(update: (image: HTMLImageElement) => void) {
    const image = selectedImageRef.current;
    if (!image?.isConnected) {
      selectImage(null);
      setUploadError("편집할 이미지를 먼저 선택하세요.");
      return;
    }
    setUploadError("");
    update(image);
    syncVisualHtml();
  }

  function toggleImageClass(className: string) {
    updateSelectedImage((image) => image.classList.toggle(className));
  }

  function setImageClass(classNames: string[], className: string) {
    updateSelectedImage((image) => {
      const shouldRemove = image.classList.contains(className);
      image.classList.remove(...classNames);
      if (!shouldRemove) image.classList.add(className);
    });
  }

  function editImageAlt() {
    const image = selectedImageRef.current;
    if (!image?.isConnected) {
      setUploadError("편집할 이미지를 먼저 선택하세요.");
      return;
    }
    const alt = window.prompt("이미지를 설명하는 글자를 입력하세요.", image.alt);
    if (alt === null) return;
    updateSelectedImage((selected) => selected.setAttribute("alt", alt));
  }

  function editImageCaption() {
    const image = selectedImageRef.current;
    if (!image?.isConnected) {
      setUploadError("편집할 이미지를 먼저 선택하세요.");
      return;
    }
    const currentFigure = image.closest("figure.wiki-image-figure");
    const currentCaption = currentFigure?.querySelector("figcaption")?.textContent || "";
    const caption = window.prompt(
      "이미지 설명을 입력하세요. 비우면 설명을 제거합니다.",
      currentCaption,
    );
    if (caption === null) return;
    if (!caption.trim()) {
      currentFigure?.querySelector("figcaption")?.remove();
      if (currentFigure && currentFigure.children.length === 1) currentFigure.replaceWith(image);
      syncVisualHtml();
      return;
    }
    if (currentFigure) {
      let captionElement = currentFigure.querySelector("figcaption");
      if (!captionElement) {
        captionElement = document.createElement("figcaption");
        currentFigure.append(captionElement);
      }
      captionElement.textContent = caption;
    } else {
      const figure = document.createElement("figure");
      figure.className = "wiki-image-figure";
      const captionElement = document.createElement("figcaption");
      captionElement.textContent = caption;
      image.replaceWith(figure);
      figure.append(image, captionElement);
    }
    syncVisualHtml();
  }

  function resetImageStyle() {
    updateSelectedImage((image) =>
      image.classList.remove(
        "wiki-image-border",
        "wiki-image-rounded",
        "wiki-image-shadow",
        "wiki-image-small",
        "wiki-image-medium",
        "wiki-image-full",
        "wiki-image-left",
        "wiki-image-center",
        "wiki-image-right",
      ),
    );
  }

  function removeSelectedImage() {
    const editor = visualRef.current;
    const image = selectedImageRef.current;
    if (!editor || !image?.isConnected) {
      selectImage(null);
      setUploadError("편집할 이미지를 먼저 선택하세요.");
      return;
    }
    const figure = image.closest("figure.wiki-image-figure");
    if (figure) figure.remove();
    else image.remove();
    selectImage(null);
    setUploadError("");
    setHtml(editor.innerHTML);
  }

  async function uploadImage(file: File) {
    const insertionMode = activeSource;
    if (insertionMode === "visual") rememberSelection();
    setUploading(true);
    setUploadError("");
    try {
      const body = new FormData();
      body.set("image", file);
      const response = await fetch("/api/admin/lore/upload", { method: "POST", body });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url)
        throw new Error(result.error || "이미지를 올릴 수 없습니다.");
      const alt = escapeAttribute(file.name.replace(/\.[^.]+$/, ""));
      const snippet = `\n<img src="${result.url}" alt="${alt}">\n`;
      if (insertionMode === "visual" && visualRef.current) {
        const marker = crypto.randomUUID();
        restoreSelection();
        document.execCommand(
          "insertHTML",
          false,
          `\n<img src="${result.url}" alt="${alt}" data-editor-upload="${marker}">\n`,
        );
        const insertedImage = visualRef.current.querySelector<HTMLImageElement>(
          `img[data-editor-upload="${marker}"]`,
        );
        insertedImage?.removeAttribute("data-editor-upload");
        if (insertedImage) selectImage(insertedImage);
        syncVisualHtml();
        rememberSelection();
        return;
      }
      const textarea = htmlRef.current;
      const start = textarea?.selectionStart ?? html.length;
      const end = textarea?.selectionEnd ?? start;
      setHtml((current) => `${current.slice(0, start)}${snippet}${current.slice(end)}`);
      setActiveSource("html");
      requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(start + snippet.length, start + snippet.length);
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "이미지를 올릴 수 없습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={saveCampaignLoreAction} className="lore-editor">
      <div className="lore-editor-toolbar">
        <div className="ledger-tabs" role="tablist" aria-label="세계관 편집 방식">
          <button
            type="button"
            className={activeSource === "visual" ? "active" : undefined}
            onClick={() => setActiveSource("visual")}
          >
            문서
          </button>
          <button
            type="button"
            className={activeSource === "html" ? "active" : undefined}
            onClick={() => setActiveSource("html")}
          >
            HTML
          </button>
          <button
            type="button"
            className={activeSource === "css" ? "active" : undefined}
            onClick={() => setActiveSource("css")}
          >
            CSS
          </button>
        </div>
        <label className="button secondary lore-image-button">
          {uploading ? "업로드 중" : "이미지 삽입"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadImage(file);
              event.target.value = "";
            }}
          />
        </label>
        <button type="submit">게시</button>
      </div>
      {uploadError && <p className="form-message">{uploadError}</p>}
      <div className="lore-editor-grid">
        <div className="lore-source-panel">
          <div className="wiki-editor" hidden={activeSource !== "visual"}>
            <div className="wiki-toolbar" role="toolbar" aria-label="문서 서식">
              <div className="wiki-tool-group" data-label="글자">
                <select
                  defaultValue=""
                  aria-label="문단 형식"
                  onChange={(event) => {
                    if (event.target.value) runEditorCommand("formatBlock", event.target.value);
                    event.target.value = "";
                  }}
                >
                  <option value="" disabled>
                    문단
                  </option>
                  <option value="p">본문</option>
                  <option value="h1">제목 1</option>
                  <option value="h2">제목 2</option>
                  <option value="h3">제목 3</option>
                </select>
                <select
                  defaultValue=""
                  aria-label="글자 크기"
                  onChange={(event) => {
                    if (event.target.value) runEditorCommand("fontSize", event.target.value);
                    event.target.value = "";
                  }}
                >
                  <option value="" disabled>
                    크기
                  </option>
                  <option value="2">작게</option>
                  <option value="3">보통</option>
                  <option value="4">크게</option>
                  <option value="5">아주 크게</option>
                </select>
                <button
                  type="button"
                  title="실행 취소"
                  aria-label="실행 취소"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("undo")}
                >
                  ↶
                </button>
                <button
                  type="button"
                  title="다시 실행"
                  aria-label="다시 실행"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("redo")}
                >
                  ↷
                </button>
                <button
                  type="button"
                  title="굵게"
                  aria-label="굵게"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("bold")}
                >
                  <strong>가</strong>
                </button>
                <button
                  type="button"
                  title="기울임"
                  aria-label="기울임"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("italic")}
                >
                  <em>가</em>
                </button>
                <button
                  type="button"
                  title="밑줄"
                  aria-label="밑줄"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("underline")}
                >
                  <u>가</u>
                </button>
                <button
                  type="button"
                  title="취소선"
                  aria-label="취소선"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("strikeThrough")}
                >
                  <s>가</s>
                </button>
                <label className="wiki-color-control" title="글자색">
                  글자
                  <input
                    type="color"
                    defaultValue="#ededf2"
                    aria-label="글자색"
                    onMouseDown={rememberSelection}
                    onChange={(event) => runEditorCommand("foreColor", event.target.value)}
                  />
                </label>
                <label className="wiki-color-control" title="배경색">
                  배경
                  <input
                    type="color"
                    defaultValue="#223344"
                    aria-label="배경색"
                    onMouseDown={rememberSelection}
                    onChange={(event) => runEditorCommand("hiliteColor", event.target.value)}
                  />
                </label>
              </div>
              <div className="wiki-tool-group" data-label="삽입">
                <button
                  type="button"
                  title="글머리표 목록"
                  aria-label="글머리표 목록"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("insertUnorderedList")}
                >
                  • 목록
                </button>
                <button
                  type="button"
                  title="번호 목록"
                  aria-label="번호 목록"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("insertOrderedList")}
                >
                  1. 목록
                </button>
                <button
                  type="button"
                  title="들여쓰기"
                  aria-label="들여쓰기"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("indent")}
                >
                  ?
                </button>
                <button
                  type="button"
                  title="내어쓰기"
                  aria-label="내어쓰기"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("outdent")}
                >
                  ?
                </button>
                <button
                  type="button"
                  title="인용문"
                  aria-label="인용문"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("formatBlock", "blockquote")}
                >
                  ?
                </button>
                <button
                  type="button"
                  title="링크"
                  aria-label="링크"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    rememberSelection();
                  }}
                  onClick={insertLink}
                >
                  ?
                </button>
                <button
                  type="button"
                  title="링크 해제"
                  aria-label="링크 해제"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("unlink")}
                >
                  ?
                </button>
                <button
                  type="button"
                  title="구분선"
                  aria-label="구분선 삽입"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("insertHorizontalRule")}
                >
                  ?
                </button>
                <button
                  type="button"
                  title="표 삽입"
                  aria-label="표 삽입"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={insertTable}
                >
                  ?
                </button>
                <button
                  type="button"
                  title="강조 상자 삽입"
                  aria-label="강조 상자 삽입"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={insertCallout}
                >
                  ?
                </button>
                <button
                  type="button"
                  title="코드 블록 삽입"
                  aria-label="코드 블록 삽입"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={insertCodeBlock}
                >
                  &lt;/&gt;
                </button>
              </div>
              <div className="wiki-tool-group" data-label="정렬">
                <button
                  type="button"
                  title="왼쪽 정렬"
                  aria-label="왼쪽 정렬"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("justifyLeft")}
                >
                  ??
                </button>
                <button
                  type="button"
                  title="가운데 정렬"
                  aria-label="가운데 정렬"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("justifyCenter")}
                >
                  ?
                </button>
                <button
                  type="button"
                  title="오른쪽 정렬"
                  aria-label="오른쪽 정렬"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("justifyRight")}
                >
                  ??
                </button>
                <button
                  type="button"
                  title="서식 지우기"
                  aria-label="서식 지우기"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runEditorCommand("removeFormat")}
                >
                  서식 지우기
                </button>
              </div>
              {hasSelectedImage && (
                <div className="wiki-tool-group wiki-image-tool-group" data-label="선택한 이미지">
                  <button
                    type="button"
                    disabled={!hasSelectedImage}
                    onClick={() => toggleImageClass("wiki-image-border")}
                  >
                    테두리
                  </button>
                  <button
                    type="button"
                    disabled={!hasSelectedImage}
                    onClick={() => toggleImageClass("wiki-image-rounded")}
                  >
                    둥글게
                  </button>
                  <button
                    type="button"
                    disabled={!hasSelectedImage}
                    onClick={() => toggleImageClass("wiki-image-shadow")}
                  >
                    그림자
                  </button>
                  <button
                    type="button"
                    disabled={!hasSelectedImage}
                    onClick={() =>
                      setImageClass(
                        ["wiki-image-small", "wiki-image-medium", "wiki-image-full"],
                        "wiki-image-small",
                      )
                    }
                  >
                    작게
                  </button>
                  <button
                    type="button"
                    disabled={!hasSelectedImage}
                    onClick={() =>
                      setImageClass(
                        ["wiki-image-small", "wiki-image-medium", "wiki-image-full"],
                        "wiki-image-medium",
                      )
                    }
                  >
                    중간
                  </button>
                  <button
                    type="button"
                    disabled={!hasSelectedImage}
                    onClick={() =>
                      setImageClass(
                        ["wiki-image-small", "wiki-image-medium", "wiki-image-full"],
                        "wiki-image-full",
                      )
                    }
                  >
                    크게
                  </button>
                  <button
                    type="button"
                    disabled={!hasSelectedImage}
                    onClick={() =>
                      setImageClass(
                        ["wiki-image-left", "wiki-image-center", "wiki-image-right"],
                        "wiki-image-left",
                      )
                    }
                  >
                    좌측
                  </button>
                  <button
                    type="button"
                    disabled={!hasSelectedImage}
                    onClick={() =>
                      setImageClass(
                        ["wiki-image-left", "wiki-image-center", "wiki-image-right"],
                        "wiki-image-center",
                      )
                    }
                  >
                    중앙
                  </button>
                  <button
                    type="button"
                    disabled={!hasSelectedImage}
                    onClick={() =>
                      setImageClass(
                        ["wiki-image-left", "wiki-image-center", "wiki-image-right"],
                        "wiki-image-right",
                      )
                    }
                  >
                    우측
                  </button>
                  <button type="button" disabled={!hasSelectedImage} onClick={editImageCaption}>
                    설명
                  </button>
                  <button type="button" disabled={!hasSelectedImage} onClick={editImageAlt}>
                    대체 글자
                  </button>
                  <button type="button" disabled={!hasSelectedImage} onClick={resetImageStyle}>
                    초기화
                  </button>
                  <button
                    type="button"
                    className="wiki-danger-button"
                    disabled={!hasSelectedImage}
                    onClick={removeSelectedImage}
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
            <div
              ref={visualRef}
              className="wiki-editor-surface"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="세계관 문서를 작성하세요."
              onInput={() => {
                if (selectedImageRef.current && !selectedImageRef.current.isConnected) {
                  selectImage(null);
                }
                syncVisualHtml();
              }}
              onClick={(event) => {
                const target = event.target;
                selectImage(target instanceof HTMLImageElement ? target : null);
                rememberSelection();
              }}
              onKeyUp={rememberSelection}
              onMouseUp={rememberSelection}
              onBlur={rememberSelection}
            />
          </div>
          <textarea
            ref={htmlRef}
            name="html"
            value={html}
            onChange={(event) => setHtml(event.target.value)}
            aria-label="세계관 HTML"
            hidden={activeSource !== "html"}
            spellCheck={false}
          />
          <textarea
            name="css"
            value={css}
            onChange={(event) => setCss(event.target.value)}
            aria-label="세계관 CSS"
            hidden={activeSource !== "css"}
            spellCheck={false}
          />
        </div>
        <div className="lore-preview-panel">
          <LoreFrame html={html} css={css} title="세계관 미리보기" />
        </div>
      </div>
    </form>
  );
}
