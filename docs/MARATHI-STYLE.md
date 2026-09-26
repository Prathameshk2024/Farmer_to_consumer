# मराठी लेखन नियम — Marathi style sheet

**The one source this app follows:** *मराठी लेखनविषयक नियम* — the orthography
rules adopted by the महाराष्ट्र शासन (1972, revised 2009) and used by
बालभारती in every state school textbook.

That source is chosen for one reason, and it is not academic. The women who
use this app learned to read from बालभारती textbooks, and many are reading
Marathi on a screen for the first time. Spelling they were taught is spelling
they recognise. Anything else — a Hindi-influenced form, an English sentence
shape wearing Marathi words, a colloquial spelling from one district — makes a
reader who is already unsure stop and wonder whether she has misread it.

**Only Marathi follows this sheet.** The English dictionary is an independent
piece of writing, not a translation, and is never edited to match a Marathi
change. The two say the same thing; they do not say it the same way.

---

## 1. Postpositions attach to the word

Marathi postpositions (शब्दयोगी अव्यये) are written **joined**, and the noun
takes its oblique form before them. Detaching them is the single commonest
mistake in Marathi UI text, because English and Hindi both put a space there.

| Wrong | Right |
|---|---|
| `बाजार मध्ये` | `बाजारात` |
| `बाजार सोबत` | `बाजारासोबत` |
| `4 थी पर्यंत` | `4 थीपर्यंत` |
| `ऑर्डर साठी` | `ऑर्डरसाठी` |

Applies to मध्ये · वर · साठी · कडे · पर्यंत · सोबत · पासून · नुसार · बद्दल ·
शिवाय · विना · खाली · पुढे · मागे.

## 2. Gender and number must agree

Every adjective, participle and verb agrees with its subject. The nouns this
app repeats, with the gender it uses them in:

| Noun | Gender | Agreeing form |
|---|---|---|
| ऑर्डर | **नपुंसकलिंग** | ऑर्डर **आले**, ऑर्डर **पाठवले आहे**, ऑर्डर **पोहोचले**, **माझे** ऑर्डर |
| भरणा | पुल्लिंग | भरणा **आला**; भरणे **आले** |
| उत्पादन | नपुंसकलिंग | उत्पादन **मंजूर झाले** |
| वस्तू | स्त्रीलिंग | वस्तू **मिळाली** |
| जागा | स्त्रीलिंग | जागा **भरल्या** |
| पिनकोड, QR कोड, UPI आयडी | पुल्लिंग | पिनकोड **हवा**, आयडी **कॉपी झाला** |

`ऑर्डर` is the one that gets argued about, so it is settled here: **neuter**,
throughout, in all three modules. It was written feminine for a while — `ऑर्डर
आली`, `माझ्या ऑर्डर` — which is the Hindi gender for the loanword, not the
Marathi one, and it read wrong to every native speaker who opened the app. The
seller's side and the buyer's side must not disagree about it either: the same
order is one object, described to two people.

A list of mixed nouns takes the **plural**: "नाव, फोन आणि पत्ता **दिसतात**",
never `दिसतो`.

## 3. Marathi word order, not translated English

Marathi puts the subordinate clause **before** the verb. `ठरते की …` is an
English relative clause in Marathi dress, and a reader has to hold the whole
sentence open waiting for it to land.

- ✅ `तुमच्या वस्तू कोणत्या ग्राहकांना दिसतील हे यावरून ठरते.`
- ❌ `यावरून ठरते की कोणत्या ग्राहकांना तुमच्या वस्तू दिसतील.`

## 4. One word for one thing

The same thing gets the same word on every screen, in all three modules. A
synonym reads as a *different* thing to someone who is decoding rather than
skimming.

| Thing | Word | Never |
|---|---|---|
| UPI address | `UPI आयडी` | `UPI ID` |
| to view | `पहा` | `पाहा` (in imperatives) |
| slot | `जागा` | `स्लॉट`, `पॅक` (पॅक is ours, not hers) |
| product | `उत्पादन` | `प्रॉडक्ट`, `माल` |
| seller | `विक्रेती` | `विक्रेता` (every seller here is a woman) |
| cart | `टोपली` | `कार्ट` |
| payment | `भरणा` | `पेमेंट` in admin-facing text |

## 5. ॲ is one character

Write `ॲ` (U+0972 DEVANAGARI LETTER CANDRA A) — `ॲप`, `व्हॉट्सॲप`.

Never the legacy sequence `अ` + ZWJ + `ॅ`. It renders as ॲ only where the font
and shaper cooperate, breaks string length and search, and the app ships no web
fonts by design — it renders in whatever Noto the phone has.

## 6. Digits are Latin

`₹500`, `12 अंकी`, `10 वी` — never `५००`. That is what is printed on money and
on a UPI screen, and this rule is already in CLAUDE.md's design rules.

## 7. Punctuation

- No space **before** `,` `.` `?` `!`; one space after.
- No serial comma before `आणि` — that is an English convention.
- Abbreviations keep their stop: `ता.`, `जि.`
- A toast that reports a completed action carries **no** trailing full stop
  (`नाव जतन झाले`); a sentence that explains something does (`… पुन्हा प्रयत्न करा.`).

## 8. Register — where colloquial is deliberate

Standard written Marathi (प्रमाण मराठी) everywhere, with two intentional
exceptions that are **not** errors and must not be "corrected":

1. **The landing-page calls to action** are colloquial: `मला विकायचं आहे`,
   `हे कसं चालतं?`. They are spoken lines, meant to sound like a neighbour
   saying them, and `मला विकायचे आहे` on a button reads like a form.
2. **Her own voice on her own buttons** is first person feminine:
   `नंतर करते`, `ऑर्डरनुसार बनवते`. The app speaks *as* her where she is
   choosing, and *to* her everywhere else (`टाका`, `पहा`, `भरा`).

Instructions are imperative and plural-polite (आदरार्थी): `टाका`, not
`टाकावे` and not `टाक`.

## 9. What is checked automatically

`frontend/tests/marathi.test.ts` and `admin/tests/marathi.test.ts` enforce the
mechanical half of this sheet — §1 detached postpositions, §4 banned synonyms,
§5 the ZWJ sequence, §6 Devanagari digits, §7 spacing. Grammar and register are
not mechanically checkable and stay a reading job.
