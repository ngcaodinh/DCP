// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SimpleStorage
 * @notice Hợp đồng mẫu để kiểm tra pipeline compile/test/deploy của dự án.
 */
contract SimpleStorage {
    uint256 private storedValue;

    /**
     * @notice Hàm ghi giá trị vào storage.
     * @param newValue Giá trị mới cần lưu.
     */
    function setValue(uint256 newValue) external {
        storedValue = newValue;
    }

    /**
     * @notice Hàm đọc giá trị đang lưu trong storage.
     * @return Giá trị hiện tại.
     */
    function getValue() external view returns (uint256) {
        return storedValue;
    }
}

