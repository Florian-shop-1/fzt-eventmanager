# Fragt die Bankzugangsdaten ab und legt sie auf diesem Rechner ab.
#
# Die Werte gehen nirgendwo hin: Sie landen in den Umgebungsvariablen
# dieses Benutzers, aus denen das Abrufprogramm sie liest. Sie werden
# nicht in eine Datei im Projektordner geschrieben, nicht ins Internet
# geschickt und nach der Eingabe auch nicht mehr angezeigt.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Zugangsdaten fuer den Bankabgleich" -ForegroundColor Cyan
Write-Host "  Volksbank Allgaeu-Oberschwaben, Konto endet auf 2019"
Write-Host ""
Write-Host "  Die Eingaben bleiben auf diesem Rechner."
Write-Host "  Bei der PIN siehst du beim Tippen nichts, das ist so gewollt."
Write-Host ""

function Frage($anzeige, $name, $geheim) {
    $alt = [Environment]::GetEnvironmentVariable($name, "User")
    $steht = $alt -and $alt -notmatch "^(dein|deine) "
    if ($steht) {
        $zeig = if ($geheim) { "gespeichert" } else { $alt }
        Write-Host "  $anzeige ist schon hinterlegt ($zeig)."
        $antwort = Read-Host "  Aendern? j/n"
        if ($antwort -notmatch "^[jJyY]") { return }
    }

    while ($true) {
        if ($geheim) {
            $sicher = Read-Host "  $anzeige" -AsSecureString
            $wert = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
                [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicher))
        } else {
            $wert = Read-Host "  $anzeige"
        }
        $wert = $wert.Trim()
        if ($wert -and $wert -notmatch "^(dein|deine) ") { break }
        Write-Host "  Bitte den echten Wert eingeben, nicht den Beispieltext." -ForegroundColor Yellow
    }

    [Environment]::SetEnvironmentVariable($name, $wert, "User")
    $wert = $null
    Write-Host "  gespeichert" -ForegroundColor Green
    Write-Host ""
}

Frage "FinTS-Produktregistrierungsnummer (von der FinTS-Leitstelle)" "FINTS_PRODUKT_ID" $false
Frage "VR-NetKey (oder Anmeldename fuers OnlineBanking)" "FINTS_USER" $false
Frage "OnlineBanking-PIN" "FINTS_PIN" $true
Write-Host "  Mehrere Konten desselben Zugangs koennen mit Komma getrennt werden," -ForegroundColor Cyan
Write-Host "  zum Beispiel: DE94...,DE66..." -ForegroundColor Cyan
Frage "Vollstaendige IBAN(s) der Geschaeftskonten" "FINTS_IBAN" $false

# Zur Sicherheit gegen Vertipper: Welche Konten sind es geworden?
$ibans = ([Environment]::GetEnvironmentVariable("FINTS_IBAN", "User") -replace "\s", "") -split ","
foreach ($eine in $ibans) {
    if (-not $eine) { continue }
    $endet = $eine.Substring([Math]::Max(0, $eine.Length - 4))
    Write-Host "  Konto ...$endet" -ForegroundColor Green
}
Write-Host "  Jedes Konto muss im Eventmanager unter Zahlungseingaenge einmal" -ForegroundColor Cyan
Write-Host "  freigeschaltet werden, sonst kommen seine Umsaetze nicht an." -ForegroundColor Cyan
Write-Host ""
$ibans = $null

Write-Host ""
Write-Host "  Fertig. Jetzt einmal den Abruf von Hand starten:" -ForegroundColor Cyan
Write-Host "  Doppelklick auf bank-abruf-erstmalig.cmd im selben Ordner."
Write-Host ""
Read-Host "  Eingabetaste zum Schliessen"
