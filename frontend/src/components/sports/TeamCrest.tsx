import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { crestContentFit } from '../../lib/footballCrest';
import { localFootballCrestKey } from '../../lib/footballTeamLogos';

export const TEAM_CREST_SIZE = 44;

const LOCAL_CREST: Record<string, ImageSourcePropType> = {
  marseille: require('../../../assets/images/symbols/marseille-icon.webp'),
  slovan: require('../../../assets/images/symbols/slovan-logo.webp'),
  lask: require('../../../assets/images/symbols/lask-icon.webp'),
  viking: require('../../../assets/images/symbols/viking-icon.webp'),
};

type Props = {
  uri: string;
  accessibilityLabel?: string;
};

function crestSource(uri: string): ImageSourcePropType {
  const key = localFootballCrestKey(uri);
  if (key && LOCAL_CREST[key]) return LOCAL_CREST[key];
  return { uri };
}

export function TeamCrest({ uri, accessibilityLabel }: Props) {
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const source = crestSource(uri);
  const sizeUri = localFootballCrestKey(uri)
    ? Image.resolveAssetSource(source)?.uri
    : uri;

  useEffect(() => {
    let cancelled = false;
    setFit('contain');
    if (!sizeUri) return () => { cancelled = true; };
    Image.getSize(
      sizeUri,
      (width, height) => {
        if (!cancelled) setFit(crestContentFit(width, height));
      },
      () => {
        /* keep contain */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sizeUri]);

  return (
    <View style={styles.box} collapsable={false}>
      <Image
        source={source}
        style={styles.img}
        resizeMode={fit}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: TEAM_CREST_SIZE,
    height: TEAM_CREST_SIZE,
    overflow: 'hidden',
  },
  img: {
    width: TEAM_CREST_SIZE,
    height: TEAM_CREST_SIZE,
  },
});
