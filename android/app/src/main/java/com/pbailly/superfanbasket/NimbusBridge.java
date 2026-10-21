package com.pbailly.superfanbasket;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Recopie les équipes favorites (gardées par l'appli web dans le localStorage de la WebView)
 * dans des SharedPreferences natives, que {@link NimbusProvider} sert au launcher Nimbus.
 * Appelé par src/lib/nimbus.ts au démarrage et à chaque changement des favoris.
 */
@CapacitorPlugin(name = "NimbusBridge")
public class NimbusBridge extends Plugin {

    static final String PREFS = "nimbus";
    static final String KEY_FAVORITES = "favorites";

    /** setFavorites({ teams: [{ id, abbr?, name? }] }) : remplace la liste, dans l'ordre reçu. */
    @PluginMethod
    public void setFavorites(PluginCall call) {
        JSArray teams = call.getArray("teams");
        if (teams == null) {
            call.reject("teams manquant");
            return;
        }
        JSONArray out = new JSONArray();
        Set<String> ids = new HashSet<>();
        try {
            for (int i = 0; i < teams.length(); i++) {
                JSONObject t = teams.optJSONObject(i);
                if (t == null) continue;
                String id = text(t, "id");
                if (id == null || !ids.add(id)) continue;
                JSONObject row = new JSONObject();
                row.put("id", id);
                String abbr = text(t, "abbr");
                if (abbr != null) row.put("abbr", abbr);
                String name = text(t, "name");
                if (name != null) row.put("name", name);
                out.put(row);
            }
        } catch (JSONException e) {
            call.reject("liste invalide", e);
            return;
        }
        save(getContext(), out);
        call.resolve();
    }

    static void save(Context context, JSONArray teams) {
        // commit (et non apply) : la liste est sur le disque avant que Nimbus ne la relise.
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_FAVORITES, teams.toString()).commit();
        context.getContentResolver().notifyChange(NimbusProvider.CONTENT_URI, null);
    }

    static JSONArray load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            return new JSONArray(prefs.getString(KEY_FAVORITES, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** Texte non vide, ou null (optString rendrait "null" pour une valeur JSON null). */
    static String text(JSONObject o, String key) {
        if (o.isNull(key)) return null;
        String s = o.optString(key, "").trim();
        return s.isEmpty() ? null : s;
    }
}
