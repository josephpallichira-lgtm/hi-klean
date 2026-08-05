/**
 * Hi-Klean off-site backup receiver — Google Apps Script.
 *
 * Receives the nightly snapshot from the Railway cron job and writes it into a
 * folder in YOUR Google Drive. Free. No API keys, no card, no third party.
 *
 * SET THIS BEFORE DEPLOYING  ▼▼▼
 */
var SECRET    = 'PUT_YOUR_OWN_LONG_RANDOM_SECRET_HERE';  // must match BACKUP_TOKEN in Railway
var FOLDER_ID = 'PUT_YOUR_DRIVE_FOLDER_ID_HERE';        // the Drive folder that receives the snapshots
var KEEP      = 60;                                   // delete Drive copies older than this many days
/** ▲▲▲ nothing below needs editing */

function doPost(e) {
  try {
    var token = (e && e.parameter && e.parameter.token) || '';
    if (!SECRET || SECRET.length < 16) return reply(500, 'receiver not configured');
    if (token !== SECRET) return reply(403, 'bad token');

    var body = JSON.parse(e.postData.contents);
    if (body.app !== 'hiklean' || !body.gzip_b64) return reply(400, 'bad payload');

    var bytes = Utilities.base64Decode(body.gzip_b64);

    // integrity check — refuse a snapshot that arrived damaged
    if (body.sha256) {
      var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
      var hex = d.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
      if (hex !== body.sha256) return reply(422, 'checksum mismatch');
    }

    var folder = DriveApp.getFolderById(FOLDER_ID);
    var name = body.filename || ('hiklean-' + body.date + '.json.gz');

    // same-day rerun replaces the day's file instead of piling up duplicates
    var dupes = folder.getFilesByName(name);
    while (dupes.hasNext()) dupes.next().setTrashed(true);

    folder.createFile(Utilities.newBlob(bytes, 'application/gzip', name));
    prune(folder);

    return reply(200, 'stored ' + name + ' (' + bytes.length + ' bytes, ' +
      body.bills + ' bills, ' + body.patients + ' patients)');
  } catch (err) {
    return reply(500, 'error: ' + err.message);
  }
}

function doGet() { return reply(200, 'Hi-Klean backup receiver is alive. POST only.'); }

function prune(folder) {
  var cutoff = new Date().getTime() - KEEP * 86400000;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getDateCreated().getTime() < cutoff) f.setTrashed(true);
  }
}

function reply(code, msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: code === 200, code: code, message: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
