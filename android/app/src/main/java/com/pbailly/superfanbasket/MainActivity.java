package com.pbailly.superfanbasket;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locaux (dans ce projet, pas dans node_modules) : à déclarer avant super.onCreate.
        registerPlugin(NimbusBridge.class);
        super.onCreate(savedInstanceState);
    }
}
