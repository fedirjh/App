import {useContext} from 'react';
import {WindowDimensionsContext} from '../components/withWindowDimensions';

/**
 * Hook for getting current state of window dimensions
 * @returns {Object}
 */
export default function useWindowDimensions() {
    return useContext(WindowDimensionsContext);
}
