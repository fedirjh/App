// eslint-disable-next-line no-restricted-imports
import {useState, useEffect} from 'react';
import {Dimensions} from 'react-native';

export default function () {
    const [dimensions, setDimensions] = useState(() => {
        const window = Dimensions.get('window');
        const screen = Dimensions.get('screen');

        return {
            screenHeight: screen.height,
            screenWidth: screen.width,
            initialHeight: window.height,
            initialWidth: window.width,
        };
    });

    useEffect(() => {
        const onDimensionChange = (newDimensions) => {
            const {window, screen} = newDimensions;

            setDimensions((oldState) => {
                if (screen.width !== oldState.screenWidth || screen.height !== oldState.screenHeight || window.height > oldState.initialHeight) {
                    return {
                        initialHeight: window.height,
                        initialWidth: window.width,
                        screenHeight: screen.height,
                        screenWidth: screen.width,
                    };
                }

                return oldState;
            });
        };

        const dimensionsEventListener = Dimensions.addEventListener('change', onDimensionChange);

        return () => {
            if (!dimensionsEventListener) {
                return;
            }
            dimensionsEventListener.remove();
        };
    }, []);

    return {
        initialWidth: dimensions.initialWidth,
        initialHeight: dimensions.initialHeight,
    };
}
