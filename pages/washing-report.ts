import type { PipaClient } from "./pipa-api";
import type { Snapshot, Team, Visit } from "./pipa-types";
import { makeZip, download } from "./archive-format";
import { statusLabels } from "./pipa-model.mjs";

// Relatório mensal de lavagem em Word (.docx), montado à mão em OOXML.
// Layout: cabeçalho com logos, capa com resumo por equipe, um bloco por atendimento
// com faixa de dados e fotos lado a lado (antes | depois) em molduras de mesmo tamanho.

export type ReportLogo = { data: Uint8Array; type: "png" | "jpeg" };
export type ReportOptions = { logos?: ReportLogo[]; generatedAt?: Date };

const NAVY = "002332",
  GREEN = "005F24",
  LIME = "88CC00",
  GRAY = "647078",
  LIGHT = "F3F6F7",
  LINE = "DDE3E6";
const PAGE_W = 11906,
  MARGIN = 850,
  CONTENT = PAGE_W - 2 * MARGIN; // largura útil em twips (≈ 18,0 cm)
const enc = new TextEncoder();
const xml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const emu = (inches: number) => Math.round(inches * 914400);
const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
const tz = "America/Sao_Paulo";

// ---------- blocos de texto ----------
type RunOpts = { bold?: boolean; color?: string; size?: number; caps?: boolean; spacing?: number };
function run(text: string, o: RunOpts = {}) {
  const pr =
    (o.bold ? "<w:b/>" : "") +
    (o.caps ? "<w:caps/>" : "") +
    (o.color ? '<w:color w:val="' + o.color + '"/>' : "") +
    (o.spacing ? '<w:spacing w:val="' + o.spacing + '"/>' : "") +
    (o.size ? '<w:sz w:val="' + o.size + '"/><w:szCs w:val="' + o.size + '"/>' : "");
  return "<w:r>" + (pr ? "<w:rPr>" + pr + "</w:rPr>" : "") + '<w:t xml:space="preserve">' + xml(text) + "</w:t></w:r>";
}
type ParaOpts = { style?: string; align?: "left" | "center" | "right"; before?: number; after?: number; keepNext?: boolean; border?: string; pageBreakBefore?: boolean };
function para(runs: string, o: ParaOpts = {}) {
  const pr =
    (o.style ? '<w:pStyle w:val="' + o.style + '"/>' : "") +
    (o.keepNext ? "<w:keepNext/><w:keepLines/>" : "") +
    (o.pageBreakBefore ? "<w:pageBreakBefore/>" : "") +
    (o.border ? "<w:pBdr>" + o.border + "</w:pBdr>" : "") +
    (o.before !== undefined || o.after !== undefined ? '<w:spacing w:before="' + (o.before ?? 0) + '" w:after="' + (o.after ?? 0) + '"/>' : "") +
    (o.align ? '<w:jc w:val="' + o.align + '"/>' : "");
  return "<w:p>" + (pr ? "<w:pPr>" + pr + "</w:pPr>" : "") + runs + "</w:p>";
}
const text = (t: string, r: RunOpts = {}, p: ParaOpts = {}) => para(run(t, r), p);
const spacer = (twips: number) => para("", { before: 0, after: 0 }).replace("<w:pPr>", '<w:pPr><w:spacing w:before="0" w:after="0" w:line="' + twips + '" w:lineRule="exact"/>');

// ---------- tabelas ----------
type CellOpts = { width: number; fill?: string; vAlign?: "top" | "center" | "bottom"; borders?: string; margins?: [number, number, number, number]; span?: number };
function cell(content: string, o: CellOpts) {
  const m = o.margins || [80, 120, 80, 120];
  return (
    "<w:tc><w:tcPr>" +
    '<w:tcW w:w="' + o.width + '" w:type="dxa"/>' +
    (o.span ? '<w:gridSpan w:val="' + o.span + '"/>' : "") +
    (o.borders ? "<w:tcBorders>" + o.borders + "</w:tcBorders>" : "") +
    (o.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>' : "") +
    '<w:tcMar><w:top w:w="' + m[0] + '" w:type="dxa"/><w:left w:w="' + m[1] + '" w:type="dxa"/><w:bottom w:w="' + m[2] + '" w:type="dxa"/><w:right w:w="' + m[3] + '" w:type="dxa"/></w:tcMar>' +
    '<w:vAlign w:val="' + (o.vAlign || "center") + '"/>' +
    "</w:tcPr>" + (content || para("")) + "</w:tc>"
  );
}
const row = (cells: string, cantSplit = true) => "<w:tr>" + (cantSplit ? "<w:trPr><w:cantSplit/></w:trPr>" : "") + cells + "</w:tr>";
const none = '<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>';
function table(widths: number[], rows: string, borders = none) {
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="' + widths.reduce((a, b) => a + b, 0) + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>' +
    "<w:tblBorders>" + borders + "</w:tblBorders>" +
    '<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    "<w:tblGrid>" + widths.map((w) => '<w:gridCol w:w="' + w + '"/>').join("") + "</w:tblGrid>" +
    rows + "</w:tbl>"
  );
}

// ---------- imagens ----------
function jpegSize(data: Uint8Array) {
  let i = 2;
  while (i < data.length - 9) {
    if (data[i] !== 0xff) { i++; continue; }
    const marker = data[i + 1];
    i += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (data[i] << 8) | data[i + 1];
    if (length < 2 || i + length > data.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      const height = (data[i + 3] << 8) | data[i + 4], width = (data[i + 5] << 8) | data[i + 6];
      if (width && height) return { width, height };
    }
    i += length;
  }
  return { width: 4, height: 3 };
}
function pngSize(data: Uint8Array) {
  if (data.length < 24 || data[0] !== 0x89 || data[1] !== 0x50) return { width: 3, height: 1 };
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { width: dv.getUint32(16) || 3, height: dv.getUint32(20) || 1 };
}
const imageSize = (data: Uint8Array, type: "png" | "jpeg") => (type === "png" ? pngSize(data) : jpegSize(data));

// Desenho inline. Com `crop`, a foto preenche a moldura (corte central); sem, é reduzida para caber.
function drawing(rel: string, id: number, name: string, size: { width: number; height: number }, boxW: number, boxH: number, crop: boolean) {
  let cx = emu(boxW), cy = emu(boxH), src = "";
  if (crop) {
    const target = boxW / boxH, actual = size.width / size.height;
    if (actual > target) { const cut = Math.round(((1 - target / actual) / 2) * 100000); src = '<a:srcRect l="' + cut + '" r="' + cut + '"/>'; }
    else if (actual < target) { const cut = Math.round(((1 - actual / target) / 2) * 100000); src = '<a:srcRect t="' + cut + '" b="' + cut + '"/>'; }
  } else {
    const scale = Math.min(cx / size.width, cy / size.height);
    cx = Math.round(size.width * scale); cy = Math.round(size.height * scale);
  }
  return (
    '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    '<wp:docPr id="' + id + '" name="' + xml(name) + '" descr="' + xml(name) + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + xml(name) + '"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="' + rel + '"/>' + src + '<a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  );
}

// ---------- dados ----------
const dateLabel = (date: string) => date.split("-").reverse().join("/");
function weekday(date: string) {
  const w = new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "long", timeZone: tz });
  return w.charAt(0).toUpperCase() + w.slice(1);
}
const clock = (v: string | null) => (v ? new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz }) : "");
function schedule(v: Visit) {
  if (!v.started_at) return "Não informado";
  const start = clock(v.started_at);
  if (!v.finished_at) return start + " · em andamento";
  const minutes = Math.max(0, Math.round((new Date(v.finished_at).getTime() - new Date(v.started_at).getTime()) / 60000));
  const dur = minutes >= 60 ? Math.floor(minutes / 60) + "h" + String(minutes % 60).padStart(2, "0") : minutes + " min";
  return start + " – " + clock(v.finished_at) + " (" + dur + ")";
}
const statusColor: Record<string, string> = { completed: GREEN, partial: "8D641B", pending: "8C6C25", in_progress: "3F7898", cancelled: "8E6B65" };

// Logos padrão do cabeçalho, servidas pelo próprio site. Ausentes são ignoradas.
export async function loadReportLogos(base: string): Promise<ReportLogo[]> {
  const names = ["report-logo-left.png", "report-logo-right.png"];
  const found: ReportLogo[] = [];
  for (const name of names) {
    try {
      const r = await fetch(base + name, { cache: "no-cache" });
      if (!r.ok || !/image\/png/.test(r.headers.get("content-type") || "")) continue;
      found.push({ data: new Uint8Array(await r.arrayBuffer()), type: "png" });
    } catch { /* logo opcional */ }
  }
  if (!found.length) {
    try {
      const r = await fetch(base + "suma-brasil.png");
      if (r.ok) found.push({ data: new Uint8Array(await r.arrayBuffer()), type: "png" });
    } catch { /* sem logo */ }
  }
  return found;
}

export async function createWashingDocx(
  snapshot: Snapshot,
  month: string,
  client: PipaClient,
  onProgress?: (message: string) => void,
  options: ReportOptions = {},
): Promise<Blob> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error("Escolha um mês válido.");
  const teamOf = (id: string) => snapshot.teams.find((t) => t.id === id);
  const visits = snapshot.visits
    .filter((v) => v.service_date.startsWith(month) && v.status !== "cancelled")
    .sort((a, b) => a.service_date.localeCompare(b.service_date) || a.team_id.localeCompare(b.team_id) || (a.started_at || a.created_at).localeCompare(b.started_at || b.created_at) || a.id.localeCompare(b.id));
  if (!visits.length) throw Error("Não há atendimentos registrados neste mês para gerar o relatório.");

  // Fotos: baixadas em lotes para limitar conexões simultâneas.
  const paths = visits.flatMap((v) => [...v.photos_before, ...v.photos_after]);
  const downloaded = new Map<string, Uint8Array>();
  for (let start = 0; start < paths.length; start += 20) {
    const batch = paths.slice(start, start + 20);
    const urls = await client.photos(batch);
    if (urls.length !== batch.length) throw Error("Não foi possível localizar todas as fotografias do relatório.");
    const responses = await Promise.all(urls.map((url) => fetch(url)));
    if (responses.some((r) => !r.ok)) throw Error("Falha ao baixar uma fotografia. Atualize os registros e tente novamente.");
    const buffers = await Promise.all(responses.map((r) => r.arrayBuffer()));
    batch.forEach((p, i) => downloaded.set(p, new Uint8Array(buffers[i])));
    onProgress?.("Baixando fotografias: " + Math.min(start + batch.length, paths.length) + " de " + paths.length);
  }

  const docRels: string[] = [
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
    '<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>',
    '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
  ];
  const media: { name: string; data: Uint8Array }[] = [];
  let imageId = 0;
  function addImage(rels: string[], data: Uint8Array, type: "png" | "jpeg") {
    imageId++;
    const ext = type === "png" ? "png" : "jpg", rel = "rIdImg" + imageId, name = "imagem-" + String(imageId).padStart(4, "0") + "." + ext;
    rels.push('<Relationship Id="' + rel + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + name + '"/>');
    media.push({ name: "word/media/" + name, data });
    return { rel, id: imageId, name };
  }

  const monthName = new Date(month + "-02T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: tz });
  const monthTitle = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // ---------- cabeçalho e rodapé ----------
  const headerRels: string[] = [];
  const logos = options.logos || [];
  const logoRun = (l: ReportLogo | undefined, w: number, h: number) => {
    if (!l) return "";
    const img = addImage(headerRels, l.data, l.type);
    return drawing(img.rel, img.id, "Logo " + img.id, imageSize(l.data, l.type), w, h, false);
  };
  const sideW = 3000, midW = CONTENT - 2 * sideW;
  const headerTable = table(
    [sideW, midW, sideW],
    row(
      cell(para(logoRun(logos[0], 1.6, 0.62), { align: "left" }), { width: sideW, margins: [0, 0, 60, 0], vAlign: "center" }) +
        cell(text("Relatório de lavagem · " + monthTitle, { color: GRAY, size: 15, caps: true, spacing: 10 }, { align: "center" }), { width: midW, margins: [0, 0, 60, 0] }) +
        cell(para(logoRun(logos[1], 2.05, 0.5), { align: "right" }), { width: sideW, margins: [0, 0, 60, 0], vAlign: "center" }),
      false,
    ),
  );
  const headerXml = '<w:hdr ' + NS + ">" + headerTable + para("", { before: 0, after: 0, border: '<w:bottom w:val="single" w:sz="12" w:space="1" w:color="' + LIME + '"/>' }) + "</w:hdr>";
  const field = (code: string) => '<w:fldSimple w:instr=" ' + code + ' "><w:r><w:rPr><w:color w:val="' + GRAY + '"/><w:sz w:val="15"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>';
  const footerXml =
    '<w:ftr ' + NS + ">" +
    table(
      [CONTENT / 2, CONTENT / 2],
      row(
        cell(text("SUMA Brasil · Limpeza urbana · Ribeirão Preto-SP", { color: GRAY, size: 15 }), { width: CONTENT / 2, margins: [80, 0, 0, 0], borders: '<w:top w:val="single" w:sz="4" w:color="' + LINE + '"/>' }) +
          cell(para(run("Página ", { color: GRAY, size: 15 }) + field("PAGE") + run(" de ", { color: GRAY, size: 15 }) + field("NUMPAGES"), { align: "right" }), { width: CONTENT / 2, margins: [80, 0, 0, 0], borders: '<w:top w:val="single" w:sz="4" w:color="' + LINE + '"/>' }),
        false,
      ),
    ) +
    "</w:ftr>";

  // ---------- capa e resumo ----------
  const body: string[] = [];
  const monthJobs = snapshot.jobs.filter((j) => j.service_date.startsWith(month) && j.published && !j.cancelled);
  const done = visits.filter((v) => v.status === "completed");
  const open = visits.filter((v) => ["partial", "pending", "in_progress"].includes(v.status));
  const water = done.reduce((n, v) => n + (v.water_liters || 0), 0);
  const photoCount = paths.length;
  body.push(text("Relatório mensal", { color: GREEN, size: 22, caps: true, spacing: 20, bold: true }, { before: 600, after: 60 }));
  body.push(text("Lavagem de praças e calçadão", { color: NAVY, size: 52, bold: true }, { after: 60 }));
  body.push(text(monthTitle + " · Ribeirão Preto-SP", { color: GRAY, size: 26 }, { after: 480, border: '<w:bottom w:val="single" w:sz="18" w:space="12" w:color="' + LIME + '"/>' }));

  const kpi = (value: string, label: string) =>
    text(value, { color: NAVY, size: 44, bold: true }, { after: 20 }) + text(label, { color: GRAY, size: 16, caps: true, spacing: 6 }, { after: 0 });
  const kpiW = Math.floor(CONTENT / 4), gap = '<w:right w:val="single" w:sz="18" w:color="FFFFFF"/>';
  body.push(
    table(
      [kpiW, kpiW, kpiW, CONTENT - 3 * kpiW],
      row(
        cell(kpi(fmt(visits.length), "Atendimentos"), { width: kpiW, fill: LIGHT, margins: [220, 220, 220, 160], borders: gap }) +
          cell(kpi(fmt(done.length), "Concluídos"), { width: kpiW, fill: LIGHT, margins: [220, 220, 220, 160], borders: gap }) +
          cell(kpi(fmt(open.length), "Parciais ou pendentes"), { width: kpiW, fill: LIGHT, margins: [220, 220, 220, 160], borders: gap }) +
          cell(kpi(fmt(photoCount), "Fotografias"), { width: CONTENT - 3 * kpiW, fill: LIGHT, margins: [220, 220, 220, 160] }),
      ),
    ),
  );

  body.push(text("Desempenho por equipe", { color: NAVY, size: 24, bold: true }, { before: 480, after: 160, keepNext: true }));
  const cols = [3400, 1500, 1500, 1700, CONTENT - 3400 - 1500 - 1500 - 1700];
  const hb = '<w:bottom w:val="single" w:sz="8" w:color="' + NAVY + '"/>', rb = '<w:bottom w:val="single" w:sz="4" w:color="' + LINE + '"/>';
  const th = (t: string, w: number, align: "left" | "right" = "right") => cell(text(t, { color: GRAY, size: 15, caps: true, bold: true, spacing: 6 }, { align }), { width: w, borders: hb, margins: [60, 80, 80, 80] });
  const td = (t: string, w: number, align: "left" | "right" = "right", bold = false) => cell(text(t, { color: NAVY, size: 19, bold }, { align }), { width: w, borders: rb, margins: [100, 80, 100, 80] });
  const teamRow = (label: string, ids: string[], bold = false) => {
    const jobs = monthJobs.filter((j) => ids.includes(j.team_id)).length;
    const ok = done.filter((v) => ids.includes(v.team_id));
    const liters = ok.reduce((n, v) => n + (v.water_liters || 0), 0);
    const rate = jobs ? Math.round((ok.filter((v) => v.job_id).length / jobs) * 100) + "%" : "—";
    return row(td(label, cols[0], "left", bold) + td(fmt(jobs), cols[1], "right", bold) + td(fmt(ok.length), cols[2], "right", bold) + td(rate, cols[3], "right", bold) + td(liters ? fmt(liters) : "—", cols[4], "right", bold));
  };
  const teams: Team[] = snapshot.teams.length ? snapshot.teams : [];
  body.push(
    table(
      cols,
      row(th("Equipe", cols[0], "left") + th("Programados", cols[1]) + th("Concluídos", cols[2]) + th("Cumprimento", cols[3]) + th("Água (L)", cols[4])) +
        teams.map((t) => teamRow(t.name + (t.vehicle ? " · " + t.vehicle : ""), [t.id])).join("") +
        teamRow("Total", teams.map((t) => t.id), true),
    ),
  );
  body.push(text("Cumprimento = concluídos da programação ÷ serviços programados e liberados no mês." + (water ? "" : " Volume de água não informado nos registros."), { color: GRAY, size: 15 }, { before: 120, after: 0 }));
  const generated = (options.generatedAt || new Date()).toLocaleString("pt-BR", { timeZone: tz, dateStyle: "short", timeStyle: "short" });
  body.push(text("Gerado em " + generated + " a partir dos registros de campo das equipes.", { color: GRAY, size: 15 }, { before: 60, after: 0 }));

  // ---------- atendimentos ----------
  const photoW = (CONTENT - 240) / 2 / 1440; // polegadas por moldura
  const photoH = photoW * (2 / 3);
  let currentDate = "";
  for (const v of visits) {
    if (v.service_date !== currentDate) {
      const first = !currentDate;
      currentDate = v.service_date;
      const count = visits.filter((x) => x.service_date === currentDate).length;
      body.push(
        para(run(weekday(currentDate) + ", " + dateLabel(currentDate), { color: NAVY, size: 30, bold: true }) + run("   " + count + (count === 1 ? " atendimento" : " atendimentos"), { color: GRAY, size: 18 }), {
          keepNext: true, before: first ? 0 : 360, after: 200, pageBreakBefore: first,
          border: '<w:bottom w:val="single" w:sz="12" w:space="6" w:color="' + LIME + '"/>',
        }),
      );
    }
    const team = teamOf(v.team_id);
    // Título do atendimento + situação
    const titleW = CONTENT - 2200;
    body.push(
      table(
        [titleW, 2200],
        row(
          cell(
            text(v.location || "Local não informado", { color: NAVY, size: 24, bold: true }, { after: 30, keepNext: true }) +
              text([v.title !== v.location ? v.title : "", v.neighborhood, v.target].filter(Boolean).join(" · "), { color: GRAY, size: 17 }, { after: 0, keepNext: true }),
            { width: titleW, margins: [160, 0, 80, 0], vAlign: "bottom" },
          ) +
            cell(text(statusLabels[v.status] || v.status, { color: statusColor[v.status] || GRAY, size: 16, bold: true, caps: true, spacing: 10 }, { align: "right", after: 0, keepNext: true }), { width: 2200, margins: [160, 0, 80, 0], vAlign: "bottom" }),
        ),
      ),
    );
    // Faixa de dados
    const facts: [string, string][] = [
      ["Equipe", (team?.name || v.team_id) + (v.vehicle ? " · " + v.vehicle : "")],
      ["Horário", schedule(v)],
      ["Responsável", v.responsible || v.driver || "—"],
      ["Água", v.water_liters !== null ? fmt(v.water_liters) + " L" + (v.refills ? " · " + v.refills + " reab." : "") : "—"],
    ];
    const fw = [2700, 2900, 2500, CONTENT - 2700 - 2900 - 2500];
    body.push(
      table(
        fw,
        row(
          facts
            .map(([k, val], i) =>
              cell(text(k, { color: GRAY, size: 14, caps: true, bold: true, spacing: 6 }, { after: 20, keepNext: true }) + text(val, { color: NAVY, size: 18 }, { after: 0, keepNext: true }), {
                width: fw[i], fill: LIGHT, margins: [100, 140, 100, 100],
              }),
            )
            .join(""),
        ),
      ),
    );
    const notes = [v.notes.trim() ? ["Ocorrências", v.notes.trim()] : null, v.photo_justification.trim() ? ["Sem foto", v.photo_justification.trim()] : null].filter(Boolean) as [string, string][];
    for (const [k, val] of notes) body.push(para(run(k + ": ", { color: GREEN, size: 17, bold: true }) + run(val, { color: NAVY, size: 17 }), { before: 100, after: 0, keepNext: true }));

    // Fotos lado a lado: antes | depois
    const before = v.photos_before, after = v.photos_after, lines = Math.max(before.length, after.length);
    if (!lines) {
      body.push(text("Nenhuma fotografia registrada neste atendimento.", { color: GRAY, size: 16 }, { before: 120, after: 0 }));
    } else {
      const half = (CONTENT - 240) / 2;
      const label = (t: string) => cell(text(t, { color: GRAY, size: 14, caps: true, bold: true, spacing: 10 }, { after: 0, keepNext: true }), { width: half, margins: [160, 0, 60, 0] });
      const frame = (list: string[], i: number, caption: string) => {
        const p = list[i], data = p ? downloaded.get(p) : undefined;
        if (!data) {
          // Lado sem nenhuma foto: moldura cinza só na primeira linha. Lado com menos fotos: espaço em branco.
          if (list.length || i > 0) return cell("", { width: half, margins: [0, 0, 0, 0] });
          return cell(text("Sem fotografia " + caption, { color: "9AA5AB", size: 15 }, { align: "center", after: 0 }), { width: half, fill: LIGHT, margins: [0, 0, 0, 0] });
        }
        const img = addImage(docRels, data, "jpeg");
        return cell(para(drawing(img.rel, img.id, "Foto " + caption + " · " + (v.location || ""), jpegSize(data), photoW, photoH, true), { align: "center", after: 0 }), { width: half, margins: [0, 0, 0, 0], vAlign: "top" });
      };
      const gapCell = cell("", { width: 240, margins: [0, 0, 0, 0] });
      let rows = row(label("Antes") + cell("", { width: 240, margins: [0, 0, 0, 0] }) + label("Depois"));
      for (let i = 0; i < lines; i++) {
        rows += row(frame(before, i, "antes") + gapCell + frame(after, i, "depois"));
        if (i < lines - 1) rows += row(cell(spacer(120), { width: CONTENT, span: 3, margins: [0, 0, 0, 0] }));
      }
      body.push(table([half, 240, half], rows));
    }
    body.push(spacer(360));
  }
  body.push(
    '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="' + PAGE_W + '" w:h="16838"/><w:pgMar w:top="1500" w:right="' + MARGIN + '" w:bottom="1100" w:left="' + MARGIN + '" w:header="500" w:footer="450" w:gutter="0"/></w:sectPr>',
  );
  onProgress?.("Montando documento Word…");
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + "><w:body>" + body.join("") + "</w:body></w:document>";
  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="' + NAVY + '"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
  const settings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="false"/><w:defaultTabStop w:val="708"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>';
  const relsDoc = (items: string[]) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + items.join("") + "</Relationships>";
  const files = [
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(relsDoc(['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'])) },
    { name: "word/document.xml", data: enc.encode(documentXml) },
    { name: "word/styles.xml", data: enc.encode(styles) },
    { name: "word/settings.xml", data: enc.encode(settings) },
    { name: "word/header1.xml", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + headerXml) },
    { name: "word/footer1.xml", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + footerXml) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(relsDoc(docRels)) },
    { name: "word/_rels/header1.xml.rels", data: enc.encode(relsDoc(headerRels)) },
    ...media,
  ];
  return new Blob([makeZip(files)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
export function downloadWashingDocx(blob: Blob, month: string) {
  download(blob, "relatorio-lavagem-" + month + ".docx");
}
