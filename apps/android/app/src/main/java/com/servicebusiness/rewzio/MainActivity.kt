package com.servicebusiness.rewzio

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private val Primary = Color(0xFF3EA196)
private val screens = listOf("Splash","Onboarding","Login","OTP","Home","Earn","Daily Check-in","Missions","Watch","Ads","Survey","Offerwall","Referral","Lucky Reward","Spin","Quiz","Game","Wallet","Withdrawal","History","Profile","Settings","Notifications","Support")

data class UiState(val loading: Boolean = false, val offline: Boolean = false, val error: String? = null, val tokenPresent: Boolean = false)
class RewzioViewModel : ViewModel() {
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    fun setLoading(v: Boolean) = _state.tryEmit(_state.value.copy(loading = v))
    fun logout() = viewModelScope.launch { _state.emit(UiState()) }
}
interface TokenStore { fun save(token: String); fun get(): String?; fun clear() }
interface RewzioApi { suspend fun request(path: String, body: String? = null): Result<String> }
interface PushProvider { fun register() }
interface PlayIntegrityProvider { suspend fun token(): Result<String> }
class AndroidRepository(private val api: RewzioApi) { suspend fun get(path: String) = api.request(path) }
class LoadHomeUseCase(private val repository: AndroidRepository) { suspend operator fun invoke() = repository.get("/api/v1/wallet") }

class MainActivity : ComponentActivity() { override fun onCreate(b: Bundle?) { super.onCreate(b); setContent { RewzioApp() } } }
@Composable fun RewzioApp() { var dark by remember { mutableStateOf(true) }; var selected by remember { mutableStateOf("Home") }; val vm: RewzioViewModel = androidx.lifecycle.viewmodel.compose.viewModel(); val state by vm.state.collectAsState(); MaterialTheme(colorScheme = if (dark) darkColorScheme(primary = Primary) else lightColorScheme(primary = Primary)) { Scaffold(topBar = { TopAppBar(title = { Text("Rewzio") }, actions = { TextButton(onClick = { dark = !dark }) { Text(if (dark) "Light" else "Dark") } }) }, bottomBar = { NavigationBar { listOf("Home", "Earn", "Wallet", "Profile").forEach { item -> NavigationBarItem(selected = selected == item, onClick = { selected = item }, icon = {}, label = { Text(item) }) } } }) { pad -> Column(Modifier.padding(pad).padding(20.dp)) { Text(if (state.offline) "Offline mode" else "Connected", color = Primary); Text(selected, style = MaterialTheme.typography.headlineMedium); Spacer(Modifier.height(12.dp)); if (state.loading) CircularProgressIndicator(); screens.filter { it != selected }.take(8).forEach { TextButton(onClick = { selected = it }) { Text(it) } }; Text("IDR • Indonesia", style = MaterialTheme.typography.labelMedium) } } } }
