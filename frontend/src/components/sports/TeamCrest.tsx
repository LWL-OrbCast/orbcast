import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { crestContentFit } from '../../lib/footballCrest';

export const TEAM_CREST_SIZE = 44;

type Props = {
  uri: string;
  accessibilityLabel?: string;
};

export function TeamCrest({ uri, accessibilityLabel }: Props) {
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');

  useEffect(() => {
    let cancelled = false;
    setFit('contain');
    Image.getSize(
      uri,
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
  }, [uri]);

  return (
    <View style={styles.box} collapsable={false}>
      <Image
        source={{ uri }}
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
