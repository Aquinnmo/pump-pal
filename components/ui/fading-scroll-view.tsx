import { LinearGradient } from "expo-linear-gradient";
import { type PropsWithChildren, useRef, useState } from "react";
import {
  type ScrollViewProps,
  StyleSheet,
  ScrollView,
  View,
} from "react-native";

const FADE_HEIGHT = 24;
const SCROLL_EDGE_THRESHOLD = 4;

type FadingScrollViewProps = PropsWithChildren<
  Pick<ScrollViewProps, "contentContainerStyle" | "style">
>;

export function FadingScrollView({
  children,
  contentContainerStyle,
  style,
}: FadingScrollViewProps) {
  const scrollYRef = useRef(0);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const updateFades = () => {
    const hasOverflow =
      contentHeightRef.current >
      layoutHeightRef.current + SCROLL_EDGE_THRESHOLD;
    const nextTopFade =
      hasOverflow && scrollYRef.current > SCROLL_EDGE_THRESHOLD;
    const nextBottomFade =
      hasOverflow &&
      scrollYRef.current + layoutHeightRef.current <
        contentHeightRef.current - SCROLL_EDGE_THRESHOLD;

    setShowTopFade((current) =>
      current === nextTopFade ? current : nextTopFade,
    );
    setShowBottomFade((current) =>
      current === nextBottomFade ? current : nextBottomFade,
    );
  };

  return (
    <View
      style={styles.wrapper}
      onLayout={(event) => {
        layoutHeightRef.current = event.nativeEvent.layout.height;
        updateFades();
      }}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={contentContainerStyle}
        onContentSizeChange={(_, height) => {
          contentHeightRef.current = height;
          updateFades();
        }}
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
          updateFades();
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={[styles.scroll, style]}
      >
        {children}
      </ScrollView>

      <View
        pointerEvents="none"
        style={[styles.fadeTop, { opacity: showTopFade ? 1 : 0 }]}
      >
        <LinearGradient
          colors={["#0f0f0f", "transparent"]}
          end={{ x: 0, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.fadeGradient}
        />
      </View>

      <View
        pointerEvents="none"
        style={[styles.fadeBottom, { opacity: showBottomFade ? 1 : 0 }]}
      >
        <LinearGradient
          colors={["transparent", "#0f0f0f"]}
          end={{ x: 0, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.fadeGradient}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    position: "relative",
  },
  scroll: {
    flex: 1,
  },
  fadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: FADE_HEIGHT,
  },
  fadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: FADE_HEIGHT,
  },
  fadeGradient: {
    flex: 1,
  },
});
