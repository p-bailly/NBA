package com.pbailly.superfanbasket;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.UriMatcher;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Binder;
import android.os.Process;
import java.util.Arrays;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Sert les équipes favorites au launcher Nimbus (fr.perso.nimbus), en lecture seule :
 * content://com.pbailly.superfanbasket.nimbus/favorites → une ligne par équipe, dans l'ordre des favoris,
 * colonnes team_id (id ESPN), abbr et name (nom court, « Spurs ») ; ces deux dernières peuvent être null.
 * Les applis sont signées par des clés différentes : pas de permission « signature », on vérifie l'appelant.
 */
public class NimbusProvider extends ContentProvider {

    static final String AUTHORITY = "com.pbailly.superfanbasket.nimbus";
    static final Uri CONTENT_URI = Uri.parse("content://" + AUTHORITY);
    static final String NIMBUS = "fr.perso.nimbus";

    static final String TEAM_ID = "team_id";
    static final String ABBR = "abbr";
    static final String NAME = "name";
    private static final String[] COLUMNS = { TEAM_ID, ABBR, NAME };

    private static final int FAVORITES = 1;
    private static final UriMatcher MATCHER = new UriMatcher(UriMatcher.NO_MATCH);

    static {
        MATCHER.addURI(AUTHORITY, "favorites", FAVORITES);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        enforceCaller();
        if (MATCHER.match(uri) != FAVORITES) throw new IllegalArgumentException("URI inconnue : " + uri);
        String[] columns = projection != null ? projection : COLUMNS;
        for (String c : columns) {
            if (!Arrays.asList(COLUMNS).contains(c)) throw new IllegalArgumentException("Colonne inconnue : " + c);
        }
        MatrixCursor cursor = new MatrixCursor(columns);
        JSONArray teams = NimbusBridge.load(getContext());
        for (int i = 0; i < teams.length(); i++) {
            JSONObject t = teams.optJSONObject(i);
            if (t == null) continue;
            String id = NimbusBridge.text(t, "id");
            if (id == null) continue;
            Object[] row = new Object[columns.length];
            for (int c = 0; c < columns.length; c++) {
                switch (columns[c]) {
                    case TEAM_ID:
                        row[c] = id;
                        break;
                    case ABBR:
                        row[c] = NimbusBridge.text(t, "abbr");
                        break;
                    default:
                        row[c] = NimbusBridge.text(t, "name");
                }
            }
            cursor.addRow(row);
        }
        cursor.setNotificationUri(getContext().getContentResolver(), CONTENT_URI);
        return cursor;
    }

    @Override
    public String getType(Uri uri) {
        enforceCaller();
        return MATCHER.match(uri) == FAVORITES ? "vnd.android.cursor.dir/vnd.superfanbasket.favorite" : null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        enforceCaller();
        throw new UnsupportedOperationException("Lecture seule");
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        enforceCaller();
        throw new UnsupportedOperationException("Lecture seule");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        enforceCaller();
        throw new UnsupportedOperationException("Lecture seule");
    }

    /** Seuls Nimbus et l'appli elle-même peuvent lire ; les autres reçoivent une SecurityException. */
    private void enforceCaller() {
        if (Binder.getCallingUid() == Process.myUid()) return;
        String caller = getCallingPackage(); // vérifié par le système comme appartenant à l'UID appelant
        if (caller != null) {
            if (NIMBUS.equals(caller) || getContext().getPackageName().equals(caller)) return;
        } else {
            // Hors requête attribuée (getType avant Android 14) : on se rabat sur l'UID appelant.
            String[] packages = getContext().getPackageManager().getPackagesForUid(Binder.getCallingUid());
            if (packages != null && Arrays.asList(packages).contains(NIMBUS)) return;
        }
        throw new SecurityException("Réservé à Nimbus (" + NIMBUS + ")");
    }
}
