package com.servicebusiness.rewzio.core.security

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.servicebusiness.rewzio.TokenStore

class SecureTokenStore(context: Context) : TokenStore {
    private val prefs = EncryptedSharedPreferences.create(context, "rewzio_secure", MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(), EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    override fun save(token: String) { prefs.edit().putString("access_token", token).apply() }
    override fun get(): String? = prefs.getString("access_token", null)
    override fun clear() { prefs.edit().remove("access_token").apply() }
}
