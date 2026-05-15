import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Logo } from "../components/Logo";

export default function Index() {
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.center}>
        <Logo width={140} height={140} />
        <Text style={styles.title}>VÉRTICE</Text>
        <Text style={styles.tagline}>ASISTENCIA · OPERACIÓN · DATOS</Text>
        <Text style={styles.hint}>App móvil — supervisor / dirección</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0E1A" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  title: {
    marginTop: 24,
    color: "#F4F0E8",
    fontSize: 38,
    fontFamily: "Georgia",
    letterSpacing: 4,
  },
  tagline: {
    marginTop: 10,
    color: "#C9A961",
    fontSize: 10,
    letterSpacing: 4,
    fontWeight: "600",
  },
  hint: {
    marginTop: 48,
    color: "#F4F0E8",
    opacity: 0.45,
    fontSize: 13,
  },
});
