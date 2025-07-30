# Geräte-Organizer – Project Overview

## Übersicht

Dieses Projekt enthält eine komplette Front‑End‑Anwendung zur Verwaltung von Geräten. Die App ist als **Single‑Page‑Application** in React umgesetzt und benötigt keine Build‑Tools: Alle Skripte, Styles und Komponenten befinden sich in der Datei `index.html`. Die Anwendung implementiert mehrere Seiten (Übersicht, Historie, Namensregeln, Teile‑Benachrichtigungen und Protokoll) und speichert ihre Daten persistent in Excel‑Dateien (`.xlsx`) oder – falls kein Ordner ausgewählt wurde – im lokalen Speicher des Browsers.

### Technologie‑Stack

* **React 18** & **React‑DOM** – Aufbau der Benutzeroberfläche und Komponentenlogik.
* **React Router v6** – Steuerung der Seiten über einen Hash‑Router.
* **TailwindCSS** – Styling direkt im HTML via CDN.
* **dnd‑kit** – Drag‑&‑Drop von Karten und Listen.
* **Day.js** – Datumsformatierung.
* **uuid** – Generieren eindeutiger IDs.
* **SheetJS (xlsx)** – Lesen und Schreiben von Excel‑Dateien als Persistenzschicht.
* **File System Access API** – Ermöglicht das Speichern in einen vom Nutzer gewählten Ordner.

## Seiten und Funktionen

### Übersicht (Startseite)

* Zwei Spalten mit Gerät‑Karten. Die rechte Spalte ist mit **UC** beschriftet und erhält einen leicht rötlichen Hintergrund.
* Karten enthalten den **Anzeigenamen** (aus Namensregel abgeleitet) und die **Meldungsnummer**. Ein Klick auf die Karte öffnet Details, ein erneuter Klick schließt sie. Es kann jeweils nur eine Karte geöffnet sein.
* Ein **Drag‑Handle** rechts (⋮) ermöglicht das Verschieben innerhalb und zwischen den Spalten. Während eine Karte geöffnet ist, ist das Ziehen deaktiviert.
* In der Detailansicht werden AUN (Auftragsnummer), P/N (Teilenummer), S/N (Seriennummer) und Notizen angezeigt. Zusätzlich gibt es Buttons zum **Bearbeiten**, **Abschließen** (in die Historie verschieben) und **Löschen**.
* Über den Button **„+ Gerät hinzufügen“** öffnet sich ein Formular, in dem neue Geräte erfasst werden können. Die Felder werden beim Öffnen des Dialogs zurückgesetzt. Der Aspen‑Button kann anhand der Meldungsnummer Daten aus der Datei „Geräte nach Termin.XLSX“ auslesen und die Felder ausfüllen. Nicht gefundene Meldungsnummern bzw. fehlende Dateien werden im Protokoll ausgewiesen.

### Historie

* Abgeschlossene Geräte werden hier gelistet. Jedes Element zeigt dieselben Basisinformationen wie eine Gerät‑Karte sowie das Abschlussdatum.
* Ein roter **„Löschen“**‑Button erscheint erst beim Überfahren der Karte mit der Maus. Damit können historische Einträge entfernt werden.
* Alle Historie‑Daten werden in `history.xlsx` gespeichert.

### Namensregeln / Teile‑Benachrichtigungen

* Die **Namensregeln** erlauben die Zuordnung eines Präfixes der Teilenummer zu einem Anzeigenamen. So erscheint auf der Übersicht anstelle der rohen Teilenummer ein sprechender Name (z. B. `ABC` → „Motorsteuerung“).
* Die **Teile‑Benachrichtigungen** ordnen einem Präfix eine Nachricht zu. Wenn ein Gerät mit diesem Präfix hinzugefügt oder bearbeitet wird, erscheint ein Pop‑Up mit der Nachricht und ein entsprechender Warn‑Eintrag im Protokoll.
* Beide Listen lassen sich per Drag‑&‑Drop umsortieren. Regeln können über „Bearbeiten“ angepasst und über „Löschen“ entfernt werden. Neue Regeln werden über **„+ Regel hinzufügen“** erstellt.

### Protokoll (Logs)

* Zeigt chronologisch alle Ereignisse der App (letzter Eintrag oben). Dazu gehören Hinzufügen, Bearbeiten, Löschen, Abschluss von Geräten, Laden von Daten und Warnungen/Fehler.
* Beim Laden eines Ordners werden vorhandene Protokolle aus `logs.xlsx` geladen und mit den aktuellen Logs kombiniert, sodass nichts überschrieben wird.

## Datenpersistenz

* Standardmäßig speichert die App Daten in `localStorage`, um Browser‑Downloads zu vermeiden.
* Über den Button **„Ordner wählen“** kann ein Verzeichnis ausgewählt werden. Ab diesem Zeitpunkt werden alle Excel‑Dateien in diesem Ordner gelesen und geschrieben (`devices.xlsx`, `names.xlsx`, `part_notifications.xlsx`, `logs.xlsx`, `history.xlsx`).
* Änderungen an Geräten, Regeln oder Historie werden sofort in die entsprechenden Dateien geschrieben und sind nach einem Reload verfügbar.

## Dateien im Repository

| Datei           | Zweck                                                                                               |
|-----------------|------------------------------------------------------------------------------------------------------|
| `index.html`    | Enthält die vollständige React‑App inkl. aller Komponenten, Styles, Logik und Persistenzmechanismen |
| `README.md`     | Dieses Dokument. Beschreibt die Architektur, Nutzung und Implementierungsdetails der Anwendung.      |

## Ablauf beim Starten der Anwendung

1. Öffnen Sie die Datei `index.html` in Ihrem Browser (z. B. per Doppelklick). Die Anwendung funktioniert komplett offline.
2. In der Navigationsleiste können Sie zwischen den Seiten „Übersicht“, „Historie“, „Namensregeln“, „Teile‑Benachrichtigungen“ und „Protokoll“ wechseln.
3. Mit **„Ordner wählen“** wählen Sie ein Verzeichnis auf Ihrem Rechner, in dem Daten als Excel‑Dateien gespeichert werden sollen. Die App lädt beim Wechsel automatisch vorhandene Dateien und führt ein Protokoll darüber.

## Code‑Aufbau

Die gesamte Anwendung befindet sich im `<script type="module">`‑Block von `index.html`. Nachfolgend eine kurze Erläuterung der wichtigsten Komponenten und Funktionen:

### Store und Kontext

* **StoreProvider** – Stellt React‑Kontexte zur Verfügung, die den Zustand für Geräte, Namensregeln, Benachrichtigungsregeln, Protokolle und Historie speichern. Enthält Funktionen zum Hinzufügen, Aktualisieren und Löschen dieser Elemente. Speichert Änderungen über `saveData()` in `.xlsx`‑Dateien.
* **ToastProvider** – Liefert einfache Toast‑Benachrichtigungen und modale Pop‑Ups (für Teile‑Benachrichtigungen). Der Zustand der offenen Modals/Toasts wird hier verwaltet.

### Hilfsfunktionen

* **loadData()/saveData()** – Lesen und Schreiben von Excel‑Dateien über SheetJS. Wenn kein Ordner ausgewählt ist, wird `localStorage` verwendet.
* **useDisplayName()** – Ermittelt den Anzeigenamen eines Geräts anhand der Namensregeln.
* **usePartNotificationChecker()** – Prüft beim Hinzufügen/Ändern eines Geräts, ob eine Teile‑Benachrichtigung ausgelöst werden soll, und zeigt gegebenenfalls ein Pop‑Up an.

### Seitenkomponenten

* **BoardPage** – Startseite mit den beiden Spalten für Geräte. Verwaltet einen lokalen Zustand `expandedId`, um genau eine Karte expandiert zu halten. Stellt Funktionen für Drag‑&‑Drop (über dnd‑kit) bereit und verarbeitet Ereignisse wie Hinzufügen, Bearbeiten, Löschen und Abschließen von Geräten.
* **HistoryPage** – Listet abgeschlossene Geräte. Jeder Eintrag zeigt Details und hat einen per Hover einblendbaren „Löschen“‑Button.
* **RulesPage** – Wird für Namensregeln und Teile‑Benachrichtigungen genutzt. Eine regelbasierte Liste mit Drag‑&‑Drop‑Funktionalität und Modalen zum Bearbeiten/Hinzufügen von Regeln.
* **LogsPage** – Zeigt das Protokoll an; neue Einträge werden automatisch nach oben gescrollt.

### Komponenten

* **DeviceCard** – Stellt eine einzelne Gerät‑Karte dar. Nutzt `useSortable()` von dnd‑kit für das Drag‑Handle und verwaltet das Öffnen/Schließen der Karte über `expandedId`. Im aufgeklappten Zustand können Geräte editiert, abgeschlossen oder gelöscht werden und Notizen hinzugefügt werden.
* **DeviceModal** – Dialog zum Hinzufügen oder Bearbeiten von Geräten. Felder werden beim Öffnen zurückgesetzt oder mit bestehenden Daten gefüllt. Enthält den Aspen‑Lookup und ruft den Benachrichtigungschecker auf.
* **RuleRow & RuleModal** – Darstellung und Bearbeitung von Namens‑ und Benachrichtigungsregeln.
* **HistoryRow** – Zeigt abgeschlossene Geräte. Der Lösch‑Button wird per CSS erst auf Hover sichtbar.
* **NavBar** – Navigationsleiste mit Links zu den einzelnen Seiten und dem Ordnerauswahl‑Button.
* **ToastContainer** – Zeigt flüchtige Toast‑Meldungen in der Ecke an.

## Weiterentwicklung

Diese Anwendung lässt sich leicht um weitere Seiten oder Funktionen erweitern. Durch die Verwendung der File System Access API können auch andere Dateiformate oder zusätzliche Daten gespeichert werden. Die Excel‑Dateien ermöglichen einen einfachen Datenaustausch mit anderen Systemen.
