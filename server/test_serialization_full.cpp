#include <iostream>
#include <vector>
#include <list>
#include <set>
#include <map>
#include <sstream>

// Include the serialization headers
#include "external/nprpc/nprpc/include/nprpc/serialization/serialization.h"
#include "external/nprpc/nprpc/include/nprpc/serialization/oarchive.h"

using namespace nprpc::serialization;

int main() {
    std::cout << "=== Container Serialization Test ===\n";
    
    try {
        std::ostringstream oss;
        json_oarchive ar(oss);
        
        // Test std::vector (contiguous container)
        std::vector<int> vec = {1, 2, 3, 4, 5};
        std::cout << "Testing std::vector<int>... ";
        serialize_free(ar, vec);
        std::cout << "OK\n";
        
        // Test std::list (iterator-based container)
        std::list<int> lst = {10, 20, 30};
        std::cout << "Testing std::list<int>... ";
        serialize_free(ar, lst);
        std::cout << "OK\n";
        
        // Test std::set (iterator-based container)
        std::set<int> st = {100, 200, 300};
        std::cout << "Testing std::set<int>... ";
        serialize_free(ar, st);
        std::cout << "OK\n";
        
        // Test empty containers
        std::vector<int> empty_vec;
        std::cout << "Testing empty std::vector<int>... ";
        serialize_free(ar, empty_vec);
        std::cout << "OK\n";
        
        std::list<int> empty_lst;
        std::cout << "Testing empty std::list<int>... ";
        serialize_free(ar, empty_lst);
        std::cout << "OK\n";
        
        std::cout << "\n=== Serialization Test Passed ===\n";
        std::cout << "All container types can be serialized successfully!\n";
        
        std::cout << "\nGenerated JSON:\n" << oss.str() << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}
