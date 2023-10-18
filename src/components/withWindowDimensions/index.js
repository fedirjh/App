import React, {forwardRef, createContext, useState, useEffect} from 'react';
import PropTypes from 'prop-types';
import lodashDebounce from 'lodash/debounce';
import {Dimensions} from 'react-native';
import {SafeAreaInsetsContext} from 'react-native-safe-area-context';
import getComponentDisplayName from '../../libs/getComponentDisplayName';
import variables from '../../styles/variables';
import getWindowHeightAdjustment from '../../libs/getWindowHeightAdjustment';

const WindowDimensionsContext = createContext(null);
const windowDimensionsPropTypes = {
    // Initial width of the window
    initialWindowWidth: PropTypes.number,

    // Width of the window
    windowWidth: PropTypes.number.isRequired,

    // Initial height of the window
    initialWindowHeight: PropTypes.number,

    // Height of the window
    windowHeight: PropTypes.number.isRequired,

    // Is the window width extra narrow, like on a Fold mobile device?
    isExtraSmallScreenWidth: PropTypes.bool.isRequired,

    // Is the window width narrow, like on a mobile device?
    isSmallScreenWidth: PropTypes.bool.isRequired,

    // Is the window width medium sized, like on a tablet device?
    isMediumScreenWidth: PropTypes.bool.isRequired,

    // Is the window width wide, like on a browser or desktop?
    isLargeScreenWidth: PropTypes.bool.isRequired,
};

const windowDimensionsProviderPropTypes = {
    /* Actual content wrapped by this component */
    children: PropTypes.node.isRequired,
};

function WindowDimensionsProvider(props) {
    const initialDimensions = Dimensions.get('window');
    const screenWindowHeightDifference = Dimensions.get('screen').height - initialDimensions.height;
    const [windowDimension, setWindowDimension] = useState({
        initialWindowHeight: initialDimensions.height,
        initialWindowWidth: initialDimensions.width,
        windowHeight: initialDimensions.height,
        windowWidth: initialDimensions.width,
    });

    /**
     * Determines if a given dimension represents a landscape orientation.
     *
     * @param {Object} dimension - The dimension to check.
     * @param {number} dimension.width - The width of the dimension.
     * @param {number} dimension.height - The height of the dimension.
     * @returns {boolean} Returns `true` if the dimension is in landscape orientation, `false` otherwise.
     */
    const isLandscape = (dimension) => dimension.width >= dimension.height;

    useEffect(() => {
        const onDimensionChange = (newDimensions) => {
            const {window, screen} = newDimensions;
            const isNewDimensionMobileLandscape = isLandscape(window);
            const isPrevInitialDimensionMobileLandscape = isLandscape(initialDimensions);
            const isOrientationChange = isNewDimensionMobileLandscape !== isPrevInitialDimensionMobileLandscape;

            if (isOrientationChange) {
                initialDimensions.width = screen.width;
                initialDimensions.height = screen.height - screenWindowHeightDifference;
            }

            setWindowDimension({
                initialWindowHeight: initialDimensions.height,
                initialWindowWidth: initialDimensions.width,
                windowHeight: window.height,
                windowWidth: window.width,
            });
        };

        const onDimensionChangeDebounce = lodashDebounce(onDimensionChange, 300);

        const dimensionsEventListener = Dimensions.addEventListener('change', onDimensionChangeDebounce);

        return () => {
            if (!dimensionsEventListener) {
                return;
            }
            dimensionsEventListener.remove();
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <SafeAreaInsetsContext.Consumer>
            {(insets) => {
                const isExtraSmallScreenWidth = windowDimension.windowWidth <= variables.extraSmallMobileResponsiveWidthBreakpoint;
                const isSmallScreenWidth = windowDimension.windowWidth <= variables.mobileResponsiveWidthBreakpoint;
                const isMediumScreenWidth = !isSmallScreenWidth && windowDimension.windowWidth <= variables.tabletResponsiveWidthBreakpoint;
                const isLargeScreenWidth = !isSmallScreenWidth && !isMediumScreenWidth;
                return (
                    <WindowDimensionsContext.Provider
                        value={{
                            initialWindowHeight: windowDimension.initialWindowHeight + getWindowHeightAdjustment(insets),
                            windowHeight: windowDimension.windowHeight + getWindowHeightAdjustment(insets),
                            initialWindowWidth: windowDimension.initialWindowWidth,
                            windowWidth: windowDimension.windowWidth,
                            isExtraSmallScreenWidth,
                            isSmallScreenWidth,
                            isMediumScreenWidth,
                            isLargeScreenWidth,
                        }}
                    >
                        {props.children}
                    </WindowDimensionsContext.Provider>
                );
            }}
        </SafeAreaInsetsContext.Consumer>
    );
}

WindowDimensionsProvider.propTypes = windowDimensionsProviderPropTypes;
WindowDimensionsProvider.displayName = 'WindowDimensionsProvider';

/**
 * @param {React.Component} WrappedComponent
 * @returns {React.Component}
 */
export default function withWindowDimensions(WrappedComponent) {
    const WithWindowDimensions = forwardRef((props, ref) => (
        <WindowDimensionsContext.Consumer>
            {(windowDimensionsProps) => (
                <WrappedComponent
                    // eslint-disable-next-line react/jsx-props-no-spreading
                    {...windowDimensionsProps}
                    // eslint-disable-next-line react/jsx-props-no-spreading
                    {...props}
                    ref={ref}
                />
            )}
        </WindowDimensionsContext.Consumer>
    ));

    WithWindowDimensions.displayName = `withWindowDimensions(${getComponentDisplayName(WrappedComponent)})`;
    return WithWindowDimensions;
}

export {WindowDimensionsProvider, windowDimensionsPropTypes, WindowDimensionsContext};
