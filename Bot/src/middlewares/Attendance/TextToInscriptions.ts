import Operation from "../../models/Operation";
import { HHMMToDate } from "../../utils/Date";
import { Inscription } from "./models/Inscription";

const HEADERS_SIZE = 12;

const PRESENCE_WORDS = [
  "Validé",
  "Absence justifiée",
  "Absence injustifiée",
  "Fiche Moodle à reprendre",
  "Fiche Moodle à faire",
];

class TextToInscriptions {
  public static adjust(rows: string[][]): Operation<Inscription[]> {
    for (let row of rows) {
      const rowLength = row.length;
      if (rowLength != HEADERS_SIZE) {
        row.push(...new Array(HEADERS_SIZE - rowLength).fill(""));
      }
    }

    let results: Inscription[] = [];

    let _type, _activity, _slot, _language, _level;
    // If we meet those words, we forget the previous values
    const boundariesWords = ["Atelier", "Coaching"];

    for (let row of rows) {
      if (boundariesWords.includes(row[0])) {
        _type = row[0];
        _activity = row[1];
        _slot = row[2];
        _language = row[3];
        _level = row[4];
      }

      if (row[0] == "") {
        row[0] = _type;
        row[1] = _activity;
        row[2] = _slot;
        row[3] = _language;
        row[4] = _level;
      }

      results.push({
        type: row[0],
        activity_name: row[1],
        time: HHMMToDate(row[2]),
        language: row[3],
        niveau: row[4],
        student_lastname: row[5],
        student_firstname: row[6],
        group: row[7],
        observations: row[8],
        english_level: row[9],
        spanish_level: row[10],
        validation: row[11],
      });
    }

    return { result: results, returnCode: 0 };
  }

  public static parseTextFileToRows(text: string): string[][] {
    const textRows = text
      .trim()
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.split("\t"));

    textRows.shift();
    return textRows;
  }

  /**
   * Fallback for text without any tabulation (e.g. typed in a slash command).
   * Expected shape after the header:
   *   <Atelier|Coaching> <activity...> HH:MM <language> <level>
   *   then, for each student: <lastname...> <firstname> BUT <year> <dept> [validation]
   */
  public static parseSpaceSeparatedRows(text: string): string[][] {
    const tokens = text.trim().split(/\s+/);
    const isMarker = (t: string) => t === "Atelier" || t === "Coaching";
    const isTime = (t: string) => /^\d{1,2}:\d{2}$/.test(t);
    const isGroupStart = (t: string) => t === "BUT";

    const start = tokens.findIndex(isMarker);
    if (start === -1) {
      throw new Error("Format invalide : 'Atelier' ou 'Coaching' introuvable.");
    }

    const rows: string[][] = [];
    let type = "",
      activity = "",
      slot = "",
      language = "",
      level = "";
    let i = start;

    while (i < tokens.length) {
      if (isMarker(tokens[i])) {
        type = tokens[i++];
        const act: string[] = [];
        while (i < tokens.length && !isTime(tokens[i])) act.push(tokens[i++]);
        if (i >= tokens.length) {
          throw new Error("Format invalide : créneau horaire introuvable.");
        }
        activity = act.join(" ");
        slot = tokens[i++];
        language = tokens[i++] ?? "";
        level = tokens[i++] ?? "";
        continue;
      }

      // Student: name tokens up to the group
      const name: string[] = [];
      while (i < tokens.length && !isGroupStart(tokens[i]) && !isMarker(tokens[i])) {
        name.push(tokens[i++]);
      }
      if (i >= tokens.length || isMarker(tokens[i]) || name.length < 2) {
        throw new Error(
          `Format invalide : étudiant illisible près de "${name.join(" ")}".`
        );
      }
      const firstname = name.pop() as string;
      const lastname = name.join(" ");
      const group = tokens.slice(i, i + 3).join(" ");
      i += 3;

      // Optional validation word(s) right after the group
      let validation = "";
      for (const word of PRESENCE_WORDS) {
        const w = word.split(" ");
        if (tokens.slice(i, i + w.length).join(" ") === word) {
          validation = word;
          i += w.length;
          break;
        }
      }

      rows.push([
        type, activity, slot, language, level,
        lastname, firstname, group, "", "", "", validation,
      ]);
    }

    return rows;
  }

  public static parseTextToRows(text: string): string[][] {
    // Real table copy (one line per row): same layout as the file format
    if (/\n/.test(text.trim())) return TextToInscriptions.parseTextFileToRows(text);
    if (!text.includes("\t")) return TextToInscriptions.parseSpaceSeparatedRows(text);

    // Split the text by the tabulation
    const rowsText = text.trim().split("\t ");
    // Find the first "Atelier"/"Coaching" marker, preceded by any whitespace
    // (space, tab or newline depending on how the text was copied)
    const match = /\s+(Atelier|Coaching)(?=\s|$)/.exec(rowsText[0]);
    if (!match) {
      throw new Error(
        "Format invalide : impossible de trouver 'Atelier' ou 'Coaching' après l'en-tête."
      );
    }
    const firstWord = match[1];

    // Split the first row around the marker
    const header = rowsText[0].slice(0, match.index);
    const tail = rowsText[0].slice(match.index + match[0].length).replace(/^\s+/, "");
    rowsText[0] = header;
    // Put the rest at the second place; the leading tab keeps the first cell
    // empty so it can be replaced by the marker below
    rowsText.splice(1, 0, "\t" + tail);

    const rowsArray = rowsText.map((row) => row.split("\t"));
    rowsArray[1][0] = firstWord;

    rowsArray.shift();

    const fixedArray = [];
    for (let row of rowsArray) {
      if (row.length > 12) {
        for (let i = 1; i < row.length; i++) {
          if (PRESENCE_WORDS.some((word) => row[i].includes(word))) {
            const wordSplitter = row[i].includes("Validé")
              ? "Validé"
              : row[i].includes("Absence justifiée")
              ? "Absence justifiée"
              : row[i].includes("Absence injustifiée")
              ? "Absence injustifiée"
              : row[i].includes("Fiche Moodle à reprendre")
              ? "Fiche Moodle à reprendre"
              : "Fiche Moodle à faire";

            const wordSplitted = row[i].split(wordSplitter + " ");
            // On met la première partie dans row[i]
            row[i] = wordSplitter;
            // On met la deuxième partie dans row[i+1]
            row.splice(i + 1, 0, wordSplitted[1]);

            // On découpe la row en deux et on push la première partie dans fixedArray et on recommence
            const rowSplitted = row.splice(0, i + 1);
            const rowSplitted2 = row.splice(0, row.length);
            fixedArray.push(rowSplitted);
            fixedArray.push(rowSplitted2);
          }
        }
      } else fixedArray.push(row);
    }

    return fixedArray;
  }
}

const convertTextToInscription = (
  text: string,
  fromFile: boolean = false
): Operation<Inscription[]> => {
  let rows;
  if (fromFile) rows = TextToInscriptions.parseTextFileToRows(text);
  else rows = TextToInscriptions.parseTextToRows(text);

  const operation = TextToInscriptions.adjust(rows);
  return operation;
};

export { convertTextToInscription };
